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
    private FunctionalRoleAdministrationService service = null!;

    public async Task InitializeAsync()
    {
        await postgresContainer.StartAsync();
        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(postgresContainer.GetConnectionString())
            .Options;
        dbContext = new AccessControlDbContext(options);
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
}
