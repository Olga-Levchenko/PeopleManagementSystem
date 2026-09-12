# Story 3.1 — manual smoke test for POST /api/v1/action-items (work-management-service:3004).
# Prerequisites: Docker infra up, people-service + access-control-service + work-management-service
# running, and `npm run db:deploy` applied in services/work-management-service.
#
# After updating realm-export.json, recreate Keycloak so the import runs (a plain restart is not
# enough): `docker compose --project-directory infra --env-file infra/.env up -d --force-recreate keycloak`
#
# This script enables password-grant on the local Keycloak `bff-confidential` client (dev-only
# mutation of the running container — not persisted in realm-export.json). Re-run after Keycloak reset.

$ErrorActionPreference = 'Stop'

$KeycloakBase = 'http://localhost:8080'
$Realm = 'people-management'
$ClientId = 'bff-confidential'
$ClientSecret = 'local-dev-bff-confidential-secret'
$WmsBase = 'http://localhost:3004/api/v1'

# Seeded Unit Manager (functional role + reporting line to direct reports)
$Username = 'olena.romaniuk@altexsoft.com'
$Password = 'DevPassword1!'
$OlenaPersonId = 'cccccccc-0000-0000-0000-000000000006'
$AndriiPersonId = 'cccccccc-0000-0000-0000-00000000000b' # direct report
$OutOfScopePersonId = 'cccccccc-0000-0000-0000-000000000015' # PM, not in Olena's tree

function Get-AdminToken {
    $body = @{
        grant_type = 'password'
        client_id  = 'admin-cli'
        username   = 'admin'
        password   = 'admin'
    }
    return (Invoke-RestMethod -Uri "$KeycloakBase/realms/master/protocol/openid-connect/token" `
        -Method POST -Body $body -ContentType 'application/x-www-form-urlencoded').access_token
}

function Enable-WorkManagementPeopleServiceScope {
    $adminToken = Get-AdminToken
    $wmsClients = Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/clients?clientId=work-management-service" `
        -Headers @{ Authorization = "Bearer $adminToken" }
    $wmsClientId = $wmsClients[0].id
    if (-not $wmsClientId) { throw "Keycloak client 'work-management-service' not found." }

    $scopes = Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/client-scopes" `
        -Headers @{ Authorization = "Bearer $adminToken" }
    $peopleScope = $scopes | Where-Object { $_.name -eq 'people-service-audience' } | Select-Object -First 1
    if (-not $peopleScope) { throw "Keycloak client scope 'people-service-audience' not found." }

    $existing = Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/clients/$wmsClientId/optional-client-scopes" `
        -Headers @{ Authorization = "Bearer $adminToken" }
    if ($existing.name -contains 'people-service-audience') {
        Write-Host "Keycloak: work-management-service already has people-service-audience scope."
        return
    }

    Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/clients/$wmsClientId/optional-client-scopes/$($peopleScope.id)" `
        -Method PUT -Headers @{ Authorization = "Bearer $adminToken" } | Out-Null
    Write-Host "Keycloak: attached people-service-audience scope to work-management-service (local dev only)."
}

function Enable-LocalDirectGrant {
    $adminToken = Get-AdminToken
    $clients = Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/clients?clientId=$ClientId" `
        -Headers @{ Authorization = "Bearer $adminToken" }
    $client = $clients[0]
    if (-not $client) { throw "Keycloak client '$ClientId' not found." }
    $client.clientAuthenticatorType = 'client-secret'
    $client.directAccessGrantsEnabled = $true
    $client.secret = $ClientSecret
    Invoke-RestMethod -Uri "$KeycloakBase/admin/realms/$Realm/clients/$($client.id)" `
        -Method PUT `
        -Headers @{ Authorization = "Bearer $adminToken"; 'Content-Type' = 'application/json' } `
        -Body ($client | ConvertTo-Json -Depth 20) | Out-Null
    Write-Host "Keycloak: enabled password grant on $ClientId (local dev only)."
}

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

Enable-LocalDirectGrant
Enable-WorkManagementPeopleServiceScope
$token = Get-UserAccessToken
Write-Host "Obtained access token for $Username."

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
