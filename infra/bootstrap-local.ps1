# First-run local setup: Docker infra, service .env files, RSA keys, migrations, and
# the Site Administrator hr-admin seed. Application services still run on the host;
# Compose only starts Postgres, Keycloak, and RabbitMQ.
#
# Usage (from repo root or this folder):
#   powershell -File infra/bootstrap-local.ps1

$ErrorActionPreference = 'Stop'

$InfraDir = $PSScriptRoot
$RepoRoot = Split-Path $InfraDir -Parent
$SetDotEnv = Join-Path $InfraDir 'scripts\set-dotenv-if-empty.js'
$GeneratePem = Join-Path $InfraDir 'scripts\generate-rsa-pem.js'

function Convert-ToEnvPath([string]$Path) {
    return $Path.Replace('\', '/')
}

function Invoke-InfraCompose {
    param([string[]]$ComposeArgs)
    & docker compose --project-directory $InfraDir -f (Join-Path $InfraDir 'docker-compose.yml') --env-file (Join-Path $InfraDir '.env') @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Copy-ExampleEnv([string]$ExamplePath, [string]$TargetPath) {
    if (-not (Test-Path -LiteralPath $TargetPath)) {
        Copy-Item -LiteralPath $ExamplePath -Destination $TargetPath
        Write-Host "Created $TargetPath"
    }
}

function Set-DotEnvIfEmpty([string]$FilePath, [string]$Key, [string]$Value) {
    & node $SetDotEnv $FilePath $Key $Value
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set $Key in $FilePath"
    }
}

function Ensure-RsaKey([string]$PemPath) {
    & node $GeneratePem $PemPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to generate $PemPath"
    }
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'docker')) {
    throw 'Docker is required. Install Docker Desktop and retry.'
}
if (-not (Test-Command 'node')) {
    throw 'Node.js 22+ is required (see .nvmrc).'
}
if (-not (Test-Command 'dotnet')) {
    throw '.NET SDK 8.0.x is required for access-control-service migrations.'
}

Copy-ExampleEnv (Join-Path $InfraDir '.env.example') (Join-Path $InfraDir '.env')

$PeopleDir = Join-Path $RepoRoot 'services\people-service'
$AcsDir = Join-Path $RepoRoot 'services\access-control-service'
$BffDir = Join-Path $RepoRoot 'services\bff'
$FrontendDir = Join-Path $RepoRoot 'services\frontend'
$AuthDir = Join-Path $RepoRoot 'services\authentication-service'
$NodeServiceDirs = @(
    $PeopleDir,
    (Join-Path $RepoRoot 'services\resourcing-service'),
    (Join-Path $RepoRoot 'services\work-management-service'),
    (Join-Path $RepoRoot 'services\integration-timetracker'),
    (Join-Path $RepoRoot 'services\integration-peopleforce'),
    $BffDir,
    $FrontendDir
)

Copy-ExampleEnv (Join-Path $PeopleDir '.env.example') (Join-Path $PeopleDir '.env')
Copy-ExampleEnv (Join-Path $AcsDir '.env.example') (Join-Path $AcsDir '.env')
Copy-ExampleEnv (Join-Path $BffDir '.env.example') (Join-Path $BffDir '.env')
Copy-ExampleEnv (Join-Path $FrontendDir '.env.example') (Join-Path $FrontendDir '.env')
Copy-ExampleEnv (Join-Path $AuthDir '.env.example') (Join-Path $AuthDir '.env')
Copy-ExampleEnv (Join-Path $NodeServiceDirs[1] '.env.example') (Join-Path $NodeServiceDirs[1] '.env')
Copy-ExampleEnv (Join-Path $NodeServiceDirs[2] '.env.example') (Join-Path $NodeServiceDirs[2] '.env')
Copy-ExampleEnv (Join-Path $NodeServiceDirs[3] '.env.example') (Join-Path $NodeServiceDirs[3] '.env')
Copy-ExampleEnv (Join-Path $NodeServiceDirs[4] '.env.example') (Join-Path $NodeServiceDirs[4] '.env')

$BffPem = Join-Path $BffDir '.local-bff-private-key.pem'
$AcsPem = Join-Path $AcsDir '.local-access-control-private-key.pem'
$PeoplePem = Join-Path $PeopleDir '.local-people-private-key.pem'
$WorkManagementPem = Join-Path $NodeServiceDirs[2] '.local-work-management-private-key.pem'

Ensure-RsaKey $BffPem
Ensure-RsaKey $AcsPem
Ensure-RsaKey $PeoplePem
Ensure-RsaKey $WorkManagementPem

Set-DotEnvIfEmpty (Join-Path $BffDir '.env') 'KEYCLOAK_CLIENT_PRIVATE_KEY_PATH' (Convert-ToEnvPath $BffPem)
Set-DotEnvIfEmpty (Join-Path $BffDir '.env') 'KEYCLOAK_CLIENT_KEY_ID' 'local-bff-key'
Set-DotEnvIfEmpty (Join-Path $BffDir '.env') 'SERVICE_AUTH_PRIVATE_KEY_PATH' (Convert-ToEnvPath $BffPem)
Set-DotEnvIfEmpty (Join-Path $BffDir '.env') 'SERVICE_AUTH_KEY_ID' 'local-bff-key'

Set-DotEnvIfEmpty (Join-Path $AcsDir '.env') 'SERVICE_AUTH_PRIVATE_KEY_PATH' (Convert-ToEnvPath $AcsPem)
Set-DotEnvIfEmpty (Join-Path $AcsDir '.env') 'SERVICE_AUTH_KEY_ID' 'local-access-control-key'

Set-DotEnvIfEmpty (Join-Path $PeopleDir '.env') 'SERVICE_AUTH_PRIVATE_KEY_PATH' (Convert-ToEnvPath $PeoplePem)
Set-DotEnvIfEmpty (Join-Path $PeopleDir '.env') 'SERVICE_AUTH_KEY_ID' 'local-people-key'
Set-DotEnvIfEmpty (Join-Path $NodeServiceDirs[2] '.env') 'SERVICE_AUTH_PRIVATE_KEY_PATH' (Convert-ToEnvPath $WorkManagementPem)
Set-DotEnvIfEmpty (Join-Path $NodeServiceDirs[2] '.env') 'SERVICE_AUTH_KEY_ID' 'local-work-management-key'

foreach ($libraryDir in @(
    (Join-Path $RepoRoot 'libs\config'),
    (Join-Path $RepoRoot 'libs\contracts')
)) {
    Push-Location $libraryDir
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $libraryDir 'node_modules'))) {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in $libraryDir"
            }
        }
        if ($libraryDir -like '*libs\contracts') {
            npm run build
            if ($LASTEXITCODE -ne 0) {
                throw 'libs/contracts build failed'
            }
        }
    }
    finally {
        Pop-Location
    }
}

foreach ($serviceDir in $NodeServiceDirs) {
    Push-Location $serviceDir
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $serviceDir 'node_modules'))) {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in $serviceDir"
            }
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host 'Starting Postgres, Keycloak, and RabbitMQ...'
Invoke-InfraCompose @('up', '-d')

Write-Host 'Waiting for Postgres...'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    & docker compose --project-directory $InfraDir -f (Join-Path $InfraDir 'docker-compose.yml') --env-file (Join-Path $InfraDir '.env') exec -T postgres pg_isready -h 127.0.0.1 -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    throw 'Postgres did not become ready. Is Docker Desktop running?'
}

function Get-RegClass([string]$Database, [string]$Relation) {
    $raw = & docker compose --project-directory $InfraDir -f (Join-Path $InfraDir 'docker-compose.yml') --env-file (Join-Path $InfraDir '.env') exec -T postgres psql -U postgres -d $Database -tAc "SELECT to_regclass('$Relation')"
    if ($LASTEXITCODE -ne 0) {
        return ''
    }
    return ([string]$raw).Trim()
}

if ([string]::IsNullOrWhiteSpace((Get-RegClass 'people_service' 'public.person_external_identity_links'))) {
    Write-Host 'Applying people-service migrations...'
    Push-Location $PeopleDir
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $PeopleDir 'node_modules\prisma'))) {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw 'npm install failed in services/people-service'
            }
        }
        npm run db:deploy
        if ($LASTEXITCODE -ne 0) {
            throw 'people-service prisma migrate deploy failed'
        }
    }
    finally {
        Pop-Location
    }
}

foreach ($serviceDir in $NodeServiceDirs) {
    if ($serviceDir -eq $PeopleDir) {
        continue
    }

    Push-Location $serviceDir
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $serviceDir 'node_modules'))) {
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed in $serviceDir"
            }
        }
        if (Test-Path -LiteralPath (Join-Path $serviceDir 'prisma')) {
            npm run db:deploy
            if ($LASTEXITCODE -ne 0) {
                throw "database migration failed in $serviceDir"
            }
        }
    }
    finally {
        Pop-Location
    }
}

if ([string]::IsNullOrWhiteSpace((Get-RegClass 'access_control_service' 'public.person_functional_role_assignments'))) {
    Write-Host 'Applying access-control-service migrations...'
    Push-Location $AcsDir
    try {
        dotnet tool restore
        if ($LASTEXITCODE -ne 0) {
            throw 'dotnet tool restore failed in services/access-control-service'
        }
        dotnet ef database update --project src/AccessControlService.Infrastructure --startup-project src/AccessControlService.Api
        if ($LASTEXITCODE -ne 0) {
            throw 'access-control-service EF database update failed'
        }
    }
    finally {
        Pop-Location
    }
}

if ([string]::IsNullOrWhiteSpace((Get-RegClass 'people_service' 'public.person_external_identity_links')) -or
    [string]::IsNullOrWhiteSpace((Get-RegClass 'access_control_service' 'public.person_functional_role_assignments'))) {
    throw 'Service schemas are still missing after migrate. Fix the migration error above, then re-run this script.'
}

Write-Host 'Applying identity and hr-admin seeds...'
Invoke-InfraCompose @(
    'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'people_service',
    '-v', 'ON_ERROR_STOP=1', '-f', '/seed/01-people-service.sql'
)
Invoke-InfraCompose @(
    'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'access_control_service',
    '-v', 'ON_ERROR_STOP=1', '-f', '/seed/02-access-control-service.sql'
)

Write-Host ''
Write-Host 'Local bootstrap complete. Site Administrator has hr-admin (Administration).'
Write-Host '  Sign in: tt.site-admin@altexsoft.com'
Write-Host '  Password: DevPassword1!'
Write-Host ''
Write-Host 'Compose runs Postgres, Keycloak, and RabbitMQ. Start all apps on the host with:'
Write-Host '  powershell -File infra/start-all-local.ps1'
Write-Host 'Then open http://localhost:4200'
