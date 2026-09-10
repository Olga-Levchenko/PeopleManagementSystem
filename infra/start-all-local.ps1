$ErrorActionPreference = 'Stop'

$InfraDir = $PSScriptRoot
$RepoRoot = Split-Path $PSScriptRoot -Parent

& docker compose --project-directory $InfraDir --env-file (Join-Path $InfraDir '.env') up -d
if ($LASTEXITCODE -ne 0) {
    throw 'Docker infrastructure could not be started.'
}

# The NestJS services expose 'start:dev'; the Vite frontend exposes 'dev' instead.
function Start-NodeService([string]$Directory, [string]$Script = 'start:dev') {
    Start-Process `
        -FilePath 'npm.cmd' `
        -ArgumentList @('run', $Script) `
        -WorkingDirectory (Join-Path $RepoRoot $Directory) `
        -WindowStyle Normal
}

function Start-DotnetService([string]$Directory, [string[]]$Arguments) {
    Start-Process `
        -FilePath 'dotnet.exe' `
        -ArgumentList $Arguments `
        -WorkingDirectory (Join-Path $RepoRoot $Directory) `
        -WindowStyle Normal
}

Write-Host 'Starting all application services in separate windows...'

Start-DotnetService 'services\authentication-service' @(
    'run',
    '--project', 'src/AuthenticationService.Api'
)
Start-NodeService 'services\people-service'
Start-NodeService 'services\resourcing-service'
Start-NodeService 'services\work-management-service'
Start-NodeService 'services\integration-timetracker'
Start-NodeService 'services\integration-peopleforce'
Start-DotnetService 'services\access-control-service' @(
    'run',
    '--project', 'src/AccessControlService.Api',
    '--launch-profile', 'http'
)
Start-NodeService 'services\bff'
Start-NodeService 'services\frontend' 'dev'

Write-Host ''
Write-Host 'All application services were started.'
Write-Host 'Open http://localhost:4200'
Write-Host 'Close the service windows to stop the application.'
