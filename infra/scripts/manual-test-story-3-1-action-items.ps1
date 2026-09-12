# Story 3.1 — manual smoke test for POST /api/v1/action-items (work-management-service:3004).
# Prerequisites: Docker infra up, people-service + access-control-service + work-management-service
# running, and `npm run db:deploy` applied in services/work-management-service.
#
# Uses the dedicated Keycloak client `local-api-smoke` (password grant + client-secret). Do NOT
# mutate `bff-confidential` — that client must remain client-jwt or the browser login flow breaks.
#
# After updating realm-export.json, recreate Keycloak (a plain restart is not enough):
#   docker compose --project-directory infra --env-file infra/.env up -d --force-recreate keycloak

$ErrorActionPreference = 'Stop'

$KeycloakBase = 'http://localhost:8080'
$Realm = 'people-management'
$ClientId = 'local-api-smoke'
$ClientSecret = 'local-dev-api-smoke-secret'
$WmsBase = 'http://localhost:3004/api/v1'

# Seeded Unit Manager (functional role + reporting line to direct reports)
$Username = 'olena.romaniuk@altexsoft.com'
$Password = 'DevPassword1!'
$OlenaPersonId = 'cccccccc-0000-0000-0000-000000000006'
$AndriiPersonId = 'cccccccc-0000-0000-0000-00000000000b' # direct report
$OutOfScopePersonId = 'cccccccc-0000-0000-0000-000000000015' # PM, not in Olena's tree

function Get-UserAccessToken {
    $body = @{
        grant_type    = 'password'
        client_id     = $ClientId
        client_secret = $ClientSecret
        username      = $Username
        password      = $Password
        scope         = 'openid people-service-audience access-control-service-audience work-management-service-audience'
    }
    return (Invoke-RestMethod -Uri "$KeycloakBase/realms/$Realm/protocol/openid-connect/token" `
        -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded').access_token
}

function Invoke-ActionItemCreate([string]$Token, [string]$JsonBody, [string]$Label) {
    Write-Host ""
    Write-Host "--- $Label ---"
    try {
        $response = Invoke-WebRequest -Uri "$WmsBase/action-items" -Method POST `
            -Headers @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' } `
            -Body $JsonBody -UseBasicParsing
        Write-Host "HTTP $($response.StatusCode)"
        Write-Host $response.Content
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "HTTP $status"
        Write-Host $body
    }
}

Write-Host "Checking work-management-service health..."
(Invoke-RestMethod -Uri "$WmsBase/health" -TimeoutSec 10).status | Out-Null

$token = Get-UserAccessToken
Write-Host "Obtained access token for $Username via $ClientId."

Invoke-ActionItemCreate $token (@{
    title            = 'Manual smoke: follow-up for direct report'
    assigneePersonId = $AndriiPersonId
    dueDate          = '2026-10-20T00:00:00.000Z'
    description      = 'Story 3.1 manual test script'
} | ConvertTo-Json) 'AC1 — create for direct report (expect 201)'

Invoke-ActionItemCreate $token (@{
    title            = 'Manual smoke: self-assign'
    assigneePersonId = $OlenaPersonId
    dueDate          = '2026-10-25T00:00:00.000Z'
} | ConvertTo-Json) 'Self-assign (expect 201)'

Invoke-ActionItemCreate $token (@{
    title            = 'Manual smoke: out of scope'
    assigneePersonId = $OutOfScopePersonId
    dueDate          = '2026-10-20T00:00:00.000Z'
} | ConvertTo-Json) 'Out of scope assignee (expect 403)'

Write-Host ""
Write-Host "Done. Swagger UI: http://localhost:3004/api/docs"
