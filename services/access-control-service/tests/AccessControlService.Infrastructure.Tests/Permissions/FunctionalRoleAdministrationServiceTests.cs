using System.Text.Json;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Identity;
using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Permissions;

public sealed class FunctionalRoleAdministrationServiceTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_permissions_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private AccessControlDbContext dbContext = null!;
    private DbContextOptions<AccessControlDbContext> dbOptions = null!;
    private FunctionalRoleAdministrationService service = null!;

    public async Task InitializeAsync()
    {
        await postgresContainer.StartAsync();
        dbOptions = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(postgresContainer.GetConnectionString())
            .Options;
        dbContext = new AccessControlDbContext(dbOptions);
        await dbContext.Database.MigrateAsync();

        dbContext.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.ExecutiveId,
            FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await dbContext.SaveChangesAsync();
        service = new FunctionalRoleAdministrationService(
            dbContext,
            new UnavailablePrincipalPersonResolver());
    }

    public async Task DisposeAsync()
    {
        await dbContext.DisposeAsync();
        await postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task CreateRole_ReplayedWithSameIdempotencyKey_ReturnsOriginalAndWritesOneAudit()
    {
        FunctionalRole first = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "security-campaign-owner",
            "Security Campaign Owner",
            "correlation-1",
            "idempotency-1",
            CancellationToken.None);

        FunctionalRole replay = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "security-campaign-owner",
            "Security Campaign Owner",
            "correlation-2",
            "idempotency-1",
            CancellationToken.None);

        Assert.Equal(first.Id, replay.Id);
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync());
        Assert.Equal(1, await dbContext.FunctionalRoles.CountAsync(role => !role.IsSeeded));
    }

    [Fact]
    public async Task CreateRole_ReusingIdempotencyKeyForDifferentRequest_ReturnsConflict()
    {
        await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "campaign-owner",
            "Campaign Owner",
            "correlation-1",
            "role-key",
            CancellationToken.None);

        await Assert.ThrowsAsync<IdempotencyConflictException>(() =>
            service.CreateRoleAsync(
                FixtureSeedData.ExecutiveId,
                "campaign-owner",
                "Different Display Name",
                "correlation-2",
                "role-key",
                CancellationToken.None));
    }

    [Fact]
    public async Task ScopedGrant_IsEvaluatedFromStoredAssignmentAndExactScope()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "dashboard-reader",
            "Dashboard Reader",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"unit-manager"}""",
            "correlation-2",
            null,
            CancellationToken.None);
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.DirectorId,
            role.RoleKey,
            "correlation-3",
            null,
            CancellationToken.None);

        Assert.True(await service.CheckPermissionAsync(
            FixtureSeedData.DirectorId,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"unit-manager"}""",
            CancellationToken.None));
        Assert.False(await service.CheckPermissionAsync(
            FixtureSeedData.DirectorId,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"project-manager"}""",
            CancellationToken.None));
    }

    [Fact]
    public async Task Grant_ReusingIdempotencyKeyForDifferentRequest_ReturnsConflict()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "campaign-owner",
            "Campaign Owner",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.CREATE_FORM_CAMPAIGNS,
            null,
            "correlation-2",
            "grant-key",
            CancellationToken.None);

        await Assert.ThrowsAsync<IdempotencyConflictException>(() =>
            service.GrantPermissionAsync(
                FixtureSeedData.ExecutiveId,
                role.RoleKey,
                PermissionCatalogue.CREATE_ACTION_ITEMS,
                null,
                "correlation-3",
                "grant-key",
                CancellationToken.None));
    }

    [Fact]
    public async Task Assignment_ReusingIdempotencyKeyForDifferentPerson_ReturnsConflict()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "assigned-role",
            "Assigned Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.DirectorId,
            role.RoleKey,
            "correlation-2",
            "assignment-key",
            CancellationToken.None);

        await Assert.ThrowsAsync<IdempotencyConflictException>(() =>
            service.AssignRoleAsync(
                FixtureSeedData.ExecutiveId,
                FixtureSeedData.PlatformLeadId,
                role.RoleKey,
                "correlation-3",
                "assignment-key",
                CancellationToken.None));
    }

    [Fact]
    public async Task ScopedGrantAndRevoke_AuditRecordsContainNormalizedScope()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "scoped-audit-role",
            "Scoped Audit Role",
            "correlation-1",
            null,
            CancellationToken.None);

        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{ "dashboardType": "unit-manager" }""",
            "correlation-2",
            null,
            CancellationToken.None);

        await service.RevokePermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"unit-manager"}""",
            "correlation-3",
            CancellationToken.None);

        string grantScope = await dbContext.AuthorizationAdministrationAudits
            .Where(audit => audit.Action == "permission-grant")
            .Select(audit => audit.Scope)
            .SingleAsync() ?? throw new InvalidOperationException("Grant scope was not audited.");
        string revokeScope = await dbContext.AuthorizationAdministrationAudits
            .Where(audit => audit.Action == "permission-revoke")
            .Select(audit => audit.Scope)
            .SingleAsync() ?? throw new InvalidOperationException("Revoke scope was not audited.");
        using JsonDocument grantDocument = JsonDocument.Parse(grantScope);
        using JsonDocument revokeDocument = JsonDocument.Parse(revokeScope);
        Assert.Equal(
            "unit-manager",
            grantDocument.RootElement
                .GetProperty("dashboardType")
                .GetString());
        Assert.Equal(
            "unit-manager",
            revokeDocument.RootElement
                .GetProperty("dashboardType")
                .GetString());
    }

    [Fact]
    public async Task AssignmentRevoke_AuditContainsDistinctBeforeAndAfterStates()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "revoked-assignment-role",
            "Revoked Assignment Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "correlation-2",
            null,
            CancellationToken.None);

        await service.RevokeRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "correlation-3",
            CancellationToken.None);

        AuthorizationAdministrationAudit audit =
            await dbContext.AuthorizationAdministrationAudits
                .SingleAsync(candidate => candidate.Action == "assignment-revoke");
        Assert.NotNull(audit.Before);
        Assert.NotNull(audit.After);
        Assert.NotEqual(audit.Before, audit.After);
        Assert.Contains(""""IsActive":true"""", audit.Before);
        Assert.Contains(""""IsActive":false"""", audit.After);
        Assert.Contains("RevokedAtUtc", audit.After);
    }

    [Fact]
    public async Task ScopedAdministrationGrant_DoesNotProtectFinalAdministrator()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "scoped-administrator-role",
            "Scoped Administrator Role",
            "correlation-1",
            null,
            CancellationToken.None);
        Permission administrationPermission = await dbContext.Permissions
            .SingleAsync(permission =>
                permission.Key == PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS);
        dbContext.FunctionalRolePermissionGrants.Add(new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = administrationPermission.Id,
            Scope = """{"dashboardType":"unit-manager"}""",
            GrantedAtUtc = DateTime.UtcNow,
        });
        await dbContext.SaveChangesAsync();
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.DirectorId,
            role.RoleKey,
            "correlation-2",
            null,
            CancellationToken.None);

        await Assert.ThrowsAsync<RoleConflictException>(() =>
            service.RevokeRoleAsync(
                FixtureSeedData.ExecutiveId,
                FixtureSeedData.ExecutiveId,
                "hr-admin",
                "correlation-3",
                CancellationToken.None));
    }

    [Fact]
    public async Task ActiveAssignmentForInactiveRole_IsNotReturned()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "inactive-assignment-role",
            "Inactive Assignment Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "correlation-2",
            null,
            CancellationToken.None);
        FunctionalRole storedRole = await dbContext.FunctionalRoles
            .SingleAsync(candidate => candidate.Id == role.Id);
        storedRole.IsActive = false;
        await dbContext.SaveChangesAsync();

        IReadOnlyList<AssignmentView> assignments =
            await service.GetAssignmentsAsync(FixtureSeedData.EngineerId, CancellationToken.None);

        Assert.DoesNotContain(assignments, assignment => assignment.RoleKey == role.RoleKey);
    }

    [Fact]
    public async Task RolePermissions_OrderByCanonicalNormalizedScope()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "ordered-scope-role",
            "Ordered Scope Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{ "dashboardType": "project-manager" }""",
            "correlation-2",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"delivery-manager"}""",
            "correlation-3",
            null,
            CancellationToken.None);

        IReadOnlyList<FunctionalRolePermissionView> grants =
            await service.GetRolePermissionsAsync(role.RoleKey, CancellationToken.None);

        Assert.Collection(
            grants,
            grant => Assert.Equal(
                """{"dashboardType":"delivery-manager"}""",
                grant.Scope),
            grant => Assert.Equal(
                """{"dashboardType":"project-manager"}""",
                grant.Scope));
    }

    [Fact]
    public async Task InvalidGrantScope_WritesNoAuditRecord()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "invalid-scope-role",
            "Invalid Scope Role",
            "correlation-1",
            null,
            CancellationToken.None);
        int auditCountBefore = await dbContext.AuthorizationAdministrationAudits.CountAsync();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            service.GrantPermissionAsync(
                FixtureSeedData.ExecutiveId,
                role.RoleKey,
                PermissionCatalogue.VIEW_DASHBOARD,
                """{"dashboardType":"not-valid"}""",
                "correlation-2",
                null,
                CancellationToken.None));

        Assert.Equal(
            auditCountBefore,
            await dbContext.AuthorizationAdministrationAudits.CountAsync());
    }

    [Fact]
    public async Task FinalAdministratorAssignment_CannotBeRevoked()
    {
        await Assert.ThrowsAsync<RoleConflictException>(() =>
            service.RevokeRoleAsync(
                FixtureSeedData.ExecutiveId,
                FixtureSeedData.ExecutiveId,
                "hr-admin",
                "correlation-1",
                CancellationToken.None));
    }

    [Fact]
    public async Task GetRolePermissions_ReturnsOnlyActiveStoredGrantsInDeterministicOrder()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "grant-reader",
            "Grant Reader",
            "correlation-1",
            null,
            CancellationToken.None);

        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.VIEW_DASHBOARD,
            """{ "dashboardType": "unit-manager" }""",
            "correlation-2",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.CREATE_ACTION_ITEMS,
            null,
            "correlation-3",
            null,
            CancellationToken.None);

        IReadOnlyList<FunctionalRolePermissionView> grants =
            await service.GetRolePermissionsAsync(role.RoleKey, CancellationToken.None);

        Assert.Collection(
            grants,
            grant =>
            {
                Assert.Equal(PermissionCatalogue.CREATE_ACTION_ITEMS, grant.PermissionKey);
                Assert.Null(grant.Scope);
            },
            grant =>
            {
                Assert.Equal(PermissionCatalogue.VIEW_DASHBOARD, grant.PermissionKey);
                Assert.Equal("""{"dashboardType":"unit-manager"}""", grant.Scope);
            });
    }

    [Fact]
    public async Task GetRolePermissions_ForRoleWithoutGrants_ReturnsEmptyList()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "empty-grant-reader",
            "Empty Grant Reader",
            "correlation-1",
            null,
            CancellationToken.None);

        IReadOnlyList<FunctionalRolePermissionView> grants =
            await service.GetRolePermissionsAsync(role.RoleKey, CancellationToken.None);

        Assert.Empty(grants);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("invalid sub")]
    public async Task BootstrapProvisioning_InvalidSub_ReturnsInvalidInput(string? sub)
    {
        FunctionalRoleBootstrapProvisioningService provisioning = CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId));

        BootstrapProvisioningResult result = await provisioning.ProvisionAsync(
            new BootstrapProvisioningRequest(sub), "bootstrap-correlation", CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.InvalidInput, result.Status);
    }

    [Fact]
    public async Task BootstrapProvisioning_ResolvedIdentityIsIdempotent()
    {
        FunctionalRoleBootstrapProvisioningService provisioning = CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId));
        BootstrapProvisioningRequest request = new("trusted-bootstrap-sub");

        BootstrapProvisioningResult first = await provisioning.ProvisionAsync(
            request, "bootstrap-correlation-1", CancellationToken.None);
        BootstrapProvisioningResult second = await provisioning.ProvisionAsync(
            request, "bootstrap-correlation-2", CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.Provisioned, first.Status);
        Assert.Equal(BootstrapProvisioningStatus.AlreadyProvisioned, second.Status);
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync(
            audit => audit.Action == "bootstrap"));
    }

    [Fact]
    public async Task BootstrapProvisioning_DistinguishesUnavailableAndAmbiguousIdentity()
    {
        BootstrapProvisioningResult unavailable = await CreateProvisioning(
            new PrincipalPersonResolution.Unavailable()).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-correlation",
                CancellationToken.None);
        BootstrapProvisioningResult ambiguous = await CreateProvisioning(
            new PrincipalPersonResolution.Ambiguous()).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-correlation",
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.UnavailableIdentity, unavailable.Status);
        Assert.Equal(BootstrapProvisioningStatus.AmbiguousIdentity, ambiguous.Status);
    }

    [Fact]
    public async Task BootstrapProvisioning_MissingRoleAndAuditFailureWriteNothing()
    {
        FunctionalRole role = await dbContext.FunctionalRoles.SingleAsync(
            candidate => candidate.Id == FixtureSeedData.HrAdminRoleId);
        role.IsActive = false;
        await dbContext.SaveChangesAsync();
        int assignmentCount = await dbContext.PersonFunctionalRoleAssignments.CountAsync();
        int auditCount = await dbContext.AuthorizationAdministrationAudits.CountAsync();

        BootstrapProvisioningResult missing = await CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-correlation",
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.MissingSeededRole, missing.Status);
        Assert.Equal(assignmentCount, await dbContext.PersonFunctionalRoleAssignments.CountAsync());
        Assert.Equal(auditCount, await dbContext.AuthorizationAdministrationAudits.CountAsync());
    }

    [Fact]
    public async Task OperationalState_ReportsNoAndHasActiveAdministrator()
    {
        dbContext.PersonFunctionalRoleAssignments.RemoveRange(
            await dbContext.PersonFunctionalRoleAssignments.ToListAsync());
        await dbContext.SaveChangesAsync();
        Assert.Equal(
            AdministrationOperationalState.NoActiveAdministrator,
            await service.GetOperationalStateAsync(CancellationToken.None));

        dbContext.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.EngineerId,
            FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await dbContext.SaveChangesAsync();
        Assert.Equal(
            AdministrationOperationalState.HasActiveAdministrator,
            await service.GetOperationalStateAsync(CancellationToken.None));
    }

    [Fact]
    public async Task BootstrapProvisioning_AuditFailureRollsBackAssignment()
    {
        int assignmentCount = await dbContext.PersonFunctionalRoleAssignments.CountAsync();

        BootstrapProvisioningResult result = await CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                new string('c', 101),
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.PersistenceOrAuditFailure, result.Status);
        Assert.Equal(assignmentCount, await dbContext.PersonFunctionalRoleAssignments.CountAsync());
        Assert.Empty(await dbContext.AuthorizationAdministrationAudits
            .Where(audit => audit.Action == "bootstrap")
            .ToListAsync());
    }

    [Fact]
    public async Task BootstrapProvisioning_ConcurrentCallsCreateOneAssignmentAndAudit()
    {
        async Task<BootstrapProvisioningResult> ProvisionAsync()
        {
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleBootstrapProvisioningService provisioning = new(
                context,
                new StubPrincipalResolver(
                    new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)));
            return await provisioning.ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-correlation",
                CancellationToken.None);
        }

        BootstrapProvisioningResult[] results = await Task.WhenAll(
            ProvisionAsync(),
            ProvisionAsync());

        Assert.Contains(results, result =>
            result.Status == BootstrapProvisioningStatus.Provisioned);
        Assert.Contains(results, result =>
            result.Status == BootstrapProvisioningStatus.AlreadyProvisioned);
        Assert.Equal(1, await dbContext.PersonFunctionalRoleAssignments.CountAsync(
            assignment => assignment.PersonId == FixtureSeedData.EngineerId &&
                          assignment.FunctionalRoleId == FixtureSeedData.HrAdminRoleId &&
                          assignment.IsActive));
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync(
            audit => audit.Action == "bootstrap"));
    }

    private FunctionalRoleBootstrapProvisioningService CreateProvisioning(
        PrincipalPersonResolution resolution) =>
        new(dbContext, new StubPrincipalResolver(resolution));

    private sealed class StubPrincipalResolver : IPrincipalPersonResolver
    {
        private readonly PrincipalPersonResolution resolution;

        public StubPrincipalResolver(PrincipalPersonResolution resolution)
        {
            this.resolution = resolution;
        }

        public Task<PrincipalPersonResolution> ResolvePersonAsync(
            string principalSub,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(resolution);
    }
}
