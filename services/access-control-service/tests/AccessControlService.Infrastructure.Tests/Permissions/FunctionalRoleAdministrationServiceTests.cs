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
    private FunctionalRoleReconciliationService reconciliationService = null!;

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
        reconciliationService = new FunctionalRoleReconciliationService(dbContext);
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
    public async Task Assignment_RepeatedForSamePersonAndRole_RemainsIdempotent()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "repeated-assignment-role",
            "Repeated Assignment Role",
            "correlation-1",
            null,
            CancellationToken.None);

        AssignmentOperationResult first = await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "correlation-2",
            null,
            CancellationToken.None);
        AssignmentOperationResult second = await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "correlation-3",
            null,
            CancellationToken.None);

        Assert.True(first.Created);
        Assert.False(second.Created);
        Assert.Equal(first.Assignment.Id, second.Assignment.Id);
        Assert.Equal(
            1,
            await dbContext.PersonFunctionalRoleAssignments.CountAsync(
                assignment => assignment.PersonId == FixtureSeedData.EngineerId &&
                              assignment.FunctionalRoleId == role.Id &&
                              assignment.IsActive));
    }

    [Fact]
    public async Task AssignmentStartingWhileDeactivationIsInProgress_IsRejectedAfterRoleLock()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "deactivation-first-role",
            "Deactivation First Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await using AccessControlDbContext holder = new(dbOptions);
        await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction =
            await holder.Database.BeginTransactionAsync();
        await holder.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT \"Id\" FROM functional_roles WHERE \"Id\" = {role.Id} FOR UPDATE");
        FunctionalRole lockedRole = await holder.FunctionalRoles.SingleAsync(
            candidate => candidate.Id == role.Id);
        lockedRole.IsActive = false;
        lockedRole.DeactivatedAtUtc = DateTime.UtcNow;
        await holder.SaveChangesAsync();
        int auditCountBefore = await dbContext.AuthorizationAdministrationAudits.CountAsync();
        TaskCompletionSource<bool> operationStarted =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        Task<Exception?> assignmentTask = CaptureExceptionAsync(async () =>
        {
            operationStarted.SetResult(true);
            await Task.Yield();
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleAdministrationService concurrentService = new(
                context,
                new UnavailablePrincipalPersonResolver());
            await concurrentService.AssignRoleAsync(
                FixtureSeedData.ExecutiveId,
                FixtureSeedData.EngineerId,
                role.RoleKey,
                "concurrent-assignment",
                null,
                CancellationToken.None);
        });

        await operationStarted.Task;
        await transaction.CommitAsync();
        Exception? exception = await assignmentTask;

        Assert.IsType<NotFoundException>(exception);
        await AssertValidAssignmentInvariantAsync();
        Assert.Empty(await dbContext.PersonFunctionalRoleAssignments
            .Where(assignment => assignment.FunctionalRoleId == role.Id && assignment.IsActive)
            .ToListAsync());
        Assert.Equal(auditCountBefore, await dbContext.AuthorizationAdministrationAudits.CountAsync());
    }

    [Fact]
    public async Task DeactivationStartingWhileAssignmentIsInProgress_IsRejectedAfterRoleLock()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "assignment-first-role",
            "Assignment First Role",
            "correlation-1",
            null,
            CancellationToken.None);
        await using AccessControlDbContext holder = new(dbOptions);
        await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction =
            await holder.Database.BeginTransactionAsync();
        await holder.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT \"Id\" FROM functional_roles WHERE \"Id\" = {role.Id} FOR UPDATE");
        holder.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.EngineerId,
            FunctionalRoleId = role.Id,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await holder.SaveChangesAsync();
        int auditCountBefore = await dbContext.AuthorizationAdministrationAudits.CountAsync();
        TaskCompletionSource<bool> operationStarted =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        Task<Exception?> deactivationTask = CaptureExceptionAsync(async () =>
        {
            operationStarted.SetResult(true);
            await Task.Yield();
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleAdministrationService concurrentService = new(
                context,
                new UnavailablePrincipalPersonResolver());
            await concurrentService.DeactivateRoleAsync(
                FixtureSeedData.ExecutiveId,
                role.RoleKey,
                "concurrent assignment is active",
                "concurrent-deactivation",
                CancellationToken.None);
        });

        await operationStarted.Task;
        await transaction.CommitAsync();
        Exception? exception = await deactivationTask;

        Assert.IsType<RoleConflictException>(exception);
        Assert.True(await dbContext.FunctionalRoles.AnyAsync(
            candidate => candidate.Id == role.Id && candidate.IsActive));
        await AssertValidAssignmentInvariantAsync();
        Assert.Equal(auditCountBefore, await dbContext.AuthorizationAdministrationAudits.CountAsync());
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
    public async Task CleanMigration_ContainsCompleteCanonicalCatalogue()
    {
        Assert.Equal(PermissionCatalogue.Definitions.Count, await dbContext.Permissions.CountAsync());
        Assert.Equal(FixtureSeedData.FunctionalRoles.Count, await dbContext.FunctionalRoles.CountAsync());
        Assert.Equal(
            FixtureSeedData.FunctionalRolePermissionGrants.Count,
            await dbContext.FunctionalRolePermissionGrants.CountAsync());
    }

    [Fact]
    public async Task Reconciliation_RestoresMissingCanonicalEntriesAndPreservesCustomData()
    {
        FunctionalRole customRole = new()
        {
            Id = Guid.NewGuid(),
            RoleKey = "custom-preserved-role",
            DisplayName = "Custom Preserved Role",
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };
        Permission customPermission = await dbContext.Permissions
            .SingleAsync(permission => permission.Key == PermissionCatalogue.CREATE_ACTION_ITEMS);
        FunctionalRolePermissionGrant customGrant = new()
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = customRole.Id,
            PermissionId = customPermission.Id,
            GrantedAtUtc = DateTime.UtcNow,
        };
        PersonFunctionalRoleAssignment customAssignment = new()
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.EngineerId,
            FunctionalRoleId = customRole.Id,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        };
        AuthorizationAdministrationAudit customAudit = new()
        {
            AuditId = Guid.NewGuid(),
            Action = "custom-preserved",
            TargetType = "custom-role",
            TargetId = customRole.Id,
            OccurredAtUtc = DateTime.UtcNow,
            CorrelationId = "custom-preserved-correlation",
        };
        dbContext.AddRange(customRole, customGrant, customAssignment, customAudit);

        Permission removedPermission = await dbContext.Permissions
            .SingleAsync(permission => permission.Key == PermissionCatalogue.RECORD_DEPARTURE);
        Guid manageDepartmentsPermissionId = (await dbContext.Permissions
            .SingleAsync(permission => permission.Key == PermissionCatalogue.MANAGE_DEPARTMENTS)).Id;
        FunctionalRolePermissionGrant removedGrant = await dbContext.FunctionalRolePermissionGrants
            .SingleAsync(grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId &&
                                  grant.PermissionId == manageDepartmentsPermissionId);
        dbContext.FunctionalRolePermissionGrants.Remove(removedGrant);
        dbContext.Permissions.Remove(removedPermission);
        await dbContext.SaveChangesAsync();

        FunctionalRoleReconciliationResult result = await reconciliationService.ReconcileAsync();

        Assert.Equal(1, result.CreatedPermissions);
        Assert.Equal(1, result.CreatedGrants);
        Assert.True(await dbContext.Permissions.AnyAsync(
            permission => permission.Key == PermissionCatalogue.RECORD_DEPARTURE));
        Assert.True(await dbContext.FunctionalRolePermissionGrants.AnyAsync(
            grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId &&
                     grant.PermissionId == manageDepartmentsPermissionId));
        Assert.True(await dbContext.FunctionalRoles.AnyAsync(
            role => role.Id == customRole.Id && role.DisplayName == customRole.DisplayName));
        Assert.True(await dbContext.FunctionalRolePermissionGrants.AnyAsync(
            grant => grant.Id == customGrant.Id));
        Assert.True(await dbContext.PersonFunctionalRoleAssignments.AnyAsync(
            assignment => assignment.Id == customAssignment.Id));
        Assert.True(await dbContext.AuthorizationAdministrationAudits.AnyAsync(
            audit => audit.AuditId == customAudit.AuditId));
    }

    [Fact]
    public async Task Reconciliation_IsIdempotentAndDoesNotDuplicateEquivalentScopes()
    {
        FunctionalRoleReconciliationResult first = await reconciliationService.ReconcileAsync();
        FunctionalRoleReconciliationResult second = await reconciliationService.ReconcileAsync();

        Assert.Equal(FunctionalRoleReconciliationStatus.AlreadyPresent, first.Status);
        Assert.Equal(FunctionalRoleReconciliationStatus.AlreadyPresent, second.Status);
        int grantCount = await dbContext.FunctionalRolePermissionGrants.CountAsync();

        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            "unit-manager",
            PermissionCatalogue.VIEW_DASHBOARD,
            """{ "dashboardType": "unit-manager" }""",
            "equivalent-scope-correlation",
            null,
            CancellationToken.None);

        Assert.Equal(grantCount, await dbContext.FunctionalRolePermissionGrants.CountAsync());
    }

    [Fact]
    public async Task BootstrapProvisioning_RestoresMissingHrAdminGrantsBeforeAssignment()
    {
        dbContext.FunctionalRolePermissionGrants.RemoveRange(
            await dbContext.FunctionalRolePermissionGrants
                .Where(grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId)
                .ToListAsync());
        await dbContext.SaveChangesAsync();

        BootstrapProvisioningResult result = await CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-restores-grants",
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.Provisioned, result.Status);
        Assert.Equal(
            5,
            await dbContext.FunctionalRolePermissionGrants.CountAsync(
                grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId));
        Assert.True(await service.CheckPermissionAsync(
            FixtureSeedData.EngineerId,
            PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS,
            null,
            CancellationToken.None));
    }

    [Fact]
    public async Task BootstrapProvisioning_ReconciliationFailureRollsBackAllChanges()
    {
        dbContext.FunctionalRolePermissionGrants.RemoveRange(
            await dbContext.FunctionalRolePermissionGrants
                .Where(grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId)
                .ToListAsync());
        await dbContext.SaveChangesAsync();
        int grantCount = await dbContext.FunctionalRolePermissionGrants.CountAsync();
        int assignmentCount = await dbContext.PersonFunctionalRoleAssignments.CountAsync();

        BootstrapProvisioningResult result = await CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                new string('c', 101),
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.PersistenceOrAuditFailure, result.Status);
        Assert.Equal(grantCount, await dbContext.FunctionalRolePermissionGrants.CountAsync());
        Assert.Equal(assignmentCount, await dbContext.PersonFunctionalRoleAssignments.CountAsync());
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
    public async Task BootstrapProvisioning_RestoresInactiveSeededRole()
    {
        FunctionalRole role = await dbContext.FunctionalRoles.SingleAsync(
            candidate => candidate.Id == FixtureSeedData.HrAdminRoleId);
        role.IsActive = false;
        await dbContext.SaveChangesAsync();
        BootstrapProvisioningResult result = await CreateProvisioning(
            new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)).ProvisionAsync(
                new BootstrapProvisioningRequest("trusted-bootstrap-sub"),
                "bootstrap-correlation",
                CancellationToken.None);

        Assert.Equal(BootstrapProvisioningStatus.Provisioned, result.Status);
        Assert.True(await dbContext.FunctionalRoles.AnyAsync(
            candidate => candidate.Id == FixtureSeedData.HrAdminRoleId && candidate.IsActive));
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
                    new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)),
                new FunctionalRoleReconciliationService(context));
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

    [Fact]
    public async Task BootstrapProvisioning_ConcurrentCallsRestoreMissingCanonicalPermissionAndGrant()
    {
        Guid administrationPermissionId = FixtureSeedData.Permissions
            .Single(permission =>
                permission.Key == PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS)
            .Id;
        await dbContext.FunctionalRolePermissionGrants
            .Where(grant => grant.PermissionId == administrationPermissionId)
            .ExecuteDeleteAsync();
        await dbContext.Permissions
            .Where(permission => permission.Id == administrationPermissionId)
            .ExecuteDeleteAsync();

        async Task<BootstrapProvisioningResult> ProvisionAsync()
        {
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleBootstrapProvisioningService provisioning = new(
                context,
                new StubPrincipalResolver(
                    new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId)),
                new FunctionalRoleReconciliationService(context));
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
        Assert.True(await dbContext.Permissions.AnyAsync(
            permission => permission.Id == administrationPermissionId));
        Assert.Equal(1, await dbContext.FunctionalRolePermissionGrants.CountAsync(
            grant => grant.FunctionalRoleId == FixtureSeedData.HrAdminRoleId &&
                     grant.PermissionId == administrationPermissionId &&
                     grant.Scope == null));
        Assert.Equal(1, await dbContext.PersonFunctionalRoleAssignments.CountAsync(
            assignment => assignment.PersonId == FixtureSeedData.EngineerId &&
                          assignment.FunctionalRoleId == FixtureSeedData.HrAdminRoleId &&
                          assignment.IsActive));
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync(
            audit => audit.Action == "bootstrap"));
    }

    [Fact]
    public async Task ConcurrentEquivalentUnscopedGrants_ReturnOneGrantAndOneAudit()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "concurrent-unscoped-grant",
            "Concurrent Unscoped Grant",
            "concurrency-correlation",
            null,
            CancellationToken.None);
        Guid permissionId = await dbContext.Permissions
            .Where(permission => permission.Key == PermissionCatalogue.CREATE_ACTION_ITEMS)
            .Select(permission => permission.Id)
            .SingleAsync();

        async Task<FunctionalRolePermissionGrant> GrantAsync()
        {
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleAdministrationService administration = new(
                context,
                new UnavailablePrincipalPersonResolver());
            return await administration.GrantPermissionAsync(
                FixtureSeedData.ExecutiveId,
                role.RoleKey,
                PermissionCatalogue.CREATE_ACTION_ITEMS,
                null,
                "concurrency-correlation",
                null,
                CancellationToken.None);
        }

        FunctionalRolePermissionGrant[] results = await Task.WhenAll(GrantAsync(), GrantAsync());

        Assert.Equal(results[0].Id, results[1].Id);
        Assert.Equal(1, await dbContext.FunctionalRolePermissionGrants.CountAsync(
            grant => grant.FunctionalRoleId == role.Id &&
                     grant.PermissionId == permissionId &&
                     grant.Scope == null));
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync(
            audit => audit.Action == "permission-grant" &&
                     audit.TargetType == "functional-role-permission-grant"));
    }

    [Fact]
    public async Task ConcurrentEquivalentScopedGrants_ReturnOneNormalizedGrantAndOneAudit()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "concurrent-scoped-grant",
            "Concurrent Scoped Grant",
            "concurrency-correlation",
            null,
            CancellationToken.None);
        Guid permissionId = await dbContext.Permissions
            .Where(permission => permission.Key == PermissionCatalogue.VIEW_DASHBOARD)
            .Select(permission => permission.Id)
            .SingleAsync();

        async Task<FunctionalRolePermissionGrant> GrantAsync(string scope)
        {
            await using AccessControlDbContext context = new(dbOptions);
            FunctionalRoleAdministrationService administration = new(
                context,
                new UnavailablePrincipalPersonResolver());
            return await administration.GrantPermissionAsync(
                FixtureSeedData.ExecutiveId,
                role.RoleKey,
                PermissionCatalogue.VIEW_DASHBOARD,
                scope,
                "concurrency-correlation",
                null,
                CancellationToken.None);
        }

        FunctionalRolePermissionGrant[] results = await Task.WhenAll(
            GrantAsync("""{"dashboardType": "unit-manager"}"""),
            GrantAsync("""{"dashboardType":"unit-manager"}"""));

        Assert.Equal(results[0].Id, results[1].Id);
        Assert.Equal(
            """{"dashboardType":"unit-manager"}""",
            results[0].Scope);
        Assert.Equal(1, await dbContext.FunctionalRolePermissionGrants.CountAsync(
            grant => grant.FunctionalRoleId == role.Id &&
                     grant.PermissionId == permissionId &&
                     grant.Scope == """{"dashboardType":"unit-manager"}"""));
        Assert.Equal(1, await dbContext.AuthorizationAdministrationAudits.CountAsync(
            audit => audit.Action == "permission-grant" &&
                     audit.TargetType == "functional-role-permission-grant"));
    }

    [Fact]
    public async Task FinalAdministratorRevocationFirst_DeniesFollowingMutation()
    {
        await ProvisionSecondaryAdministratorAsync();

        await service.RevokePermissionAsync(
            FixtureSeedData.ExecutiveId,
            "hr-admin",
            PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS,
            null,
            "revocation-first",
            CancellationToken.None);

        await Assert.ThrowsAsync<ForbiddenException>(() =>
            service.CreateRoleAsync(
                FixtureSeedData.ExecutiveId,
                "revocation-first-role",
                "Revocation First Role",
                "revocation-first",
                null,
                CancellationToken.None));
    }

    [Fact]
    public async Task MutationFirst_CompletesBeforeFinalAdministratorRevocation()
    {
        await ProvisionSecondaryAdministratorAsync();

        FunctionalRole created = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "mutation-first-role",
            "Mutation First Role",
            "mutation-first",
            null,
            CancellationToken.None);

        await service.RevokePermissionAsync(
            FixtureSeedData.ExecutiveId,
            "hr-admin",
            PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS,
            null,
            "mutation-first",
            CancellationToken.None);

        Assert.True(await dbContext.FunctionalRoles.AnyAsync(
            role => role.Id == created.Id));
    }

    [Fact]
    public async Task PartialIndexes_RejectDuplicateUnscopedAndScopedGrants()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "direct-index-check",
            "Direct Index Check",
            "index-correlation",
            null,
            CancellationToken.None);
        Permission createActionItems = await dbContext.Permissions.SingleAsync(
            permission => permission.Key == PermissionCatalogue.CREATE_ACTION_ITEMS);
        Permission viewDashboard = await dbContext.Permissions.SingleAsync(
            permission => permission.Key == PermissionCatalogue.VIEW_DASHBOARD);

        dbContext.FunctionalRolePermissionGrants.Add(new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = createActionItems.Id,
            Scope = null,
            GrantedAtUtc = DateTime.UtcNow,
        });
        await dbContext.SaveChangesAsync();

        dbContext.FunctionalRolePermissionGrants.Add(new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = createActionItems.Id,
            Scope = null,
            GrantedAtUtc = DateTime.UtcNow,
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => dbContext.SaveChangesAsync());
        await dbContext.DisposeAsync();

        await using AccessControlDbContext scopedContext = new(dbOptions);
        scopedContext.FunctionalRolePermissionGrants.Add(new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = viewDashboard.Id,
            Scope = """{"dashboardType":"unit-manager"}""",
            GrantedAtUtc = DateTime.UtcNow,
        });
        await scopedContext.SaveChangesAsync();
        scopedContext.FunctionalRolePermissionGrants.Add(new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = viewDashboard.Id,
            Scope = """{"dashboardType":"unit-manager"}""",
            GrantedAtUtc = DateTime.UtcNow,
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => scopedContext.SaveChangesAsync());
    }

    private async Task ProvisionSecondaryAdministratorAsync()
    {
        FunctionalRole role = await service.CreateRoleAsync(
            FixtureSeedData.ExecutiveId,
            "secondary-administrator",
            "Secondary Administrator",
            "secondary-administrator",
            null,
            CancellationToken.None);
        await service.GrantPermissionAsync(
            FixtureSeedData.ExecutiveId,
            role.RoleKey,
            PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS,
            null,
            "secondary-administrator",
            null,
            CancellationToken.None);
        await service.AssignRoleAsync(
            FixtureSeedData.ExecutiveId,
            FixtureSeedData.EngineerId,
            role.RoleKey,
            "secondary-administrator",
            null,
            CancellationToken.None);
    }

    private async Task AssertValidAssignmentInvariantAsync()
    {
        Assert.False(await (
            from assignment in dbContext.PersonFunctionalRoleAssignments
            join role in dbContext.FunctionalRoles
                on assignment.FunctionalRoleId equals role.Id
            where assignment.IsActive && !role.IsActive
            select assignment.Id).AnyAsync());
    }

    private static async Task<Exception?> CaptureExceptionAsync(Func<Task> action)
    {
        try
        {
            await action();
            return null;
        }
        catch (Exception exception)
        {
            return exception;
        }
    }

    private FunctionalRoleBootstrapProvisioningService CreateProvisioning(
        PrincipalPersonResolution resolution) =>
        new(dbContext, new StubPrincipalResolver(resolution), reconciliationService);

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
