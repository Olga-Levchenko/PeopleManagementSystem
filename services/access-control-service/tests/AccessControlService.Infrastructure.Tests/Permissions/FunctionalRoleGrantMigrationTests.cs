using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Permissions;

public sealed class FunctionalRoleGrantMigrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_grant_migration_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private DbContextOptions<AccessControlDbContext> dbOptions = null!;

    public async Task InitializeAsync()
    {
        await postgresContainer.StartAsync();
        dbOptions = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(postgresContainer.GetConnectionString())
            .Options;
    }

    public async Task DisposeAsync() => await postgresContainer.DisposeAsync();

    [Fact]
    public async Task CleanMigration_CreatesSeparateScopedAndUnscopedIndexes()
    {
        await using AccessControlDbContext context = new(dbOptions);
        await context.Database.MigrateAsync();

        List<string> indexDefinitions = await context.Database
            .SqlQuery<string>(
                $"""
                SELECT indexdef
                FROM pg_indexes
                WHERE tablename = 'functional_role_permission_grants'
                  AND indexdef LIKE '%UNIQUE%'
                """)
            .ToListAsync();

        Assert.Contains(indexDefinitions, definition =>
            definition.Contains("(\"FunctionalRoleId\", \"PermissionId\")", StringComparison.Ordinal) &&
            definition.Contains("\"Scope\" IS NULL", StringComparison.Ordinal));
        Assert.Contains(indexDefinitions, definition =>
            definition.Contains(
                "(\"FunctionalRoleId\", \"PermissionId\", \"Scope\")",
                StringComparison.Ordinal) &&
            definition.Contains("\"Scope\" IS NOT NULL", StringComparison.Ordinal));
    }

    [Fact]
    public async Task ForwardMigration_FailsClearlyWhenDuplicateUnscopedGrantsPreExist()
    {
        await using (AccessControlDbContext context = new(dbOptions))
        {
            await context.Database.GetService<IMigrator>().MigrateAsync(
                "20260902205504_AddFunctionalRolesAndPermissions",
                CancellationToken.None);

            context.FunctionalRolePermissionGrants.AddRange(
                new FunctionalRolePermissionGrant
                {
                    Id = Guid.NewGuid(),
                    FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
                    PermissionId = FixtureSeedData.Permissions.Single(
                        permission => permission.Key ==
                                      PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS).Id,
                    Scope = null,
                    GrantedAtUtc = DateTime.UtcNow,
                },
                new FunctionalRolePermissionGrant
                {
                    Id = Guid.NewGuid(),
                    FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
                    PermissionId = FixtureSeedData.Permissions.Single(
                        permission => permission.Key ==
                                      PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS).Id,
                    Scope = null,
                    GrantedAtUtc = DateTime.UtcNow,
                });
            await context.SaveChangesAsync();
        }

        await using AccessControlDbContext migrationContext = new(dbOptions);
        PostgresException exception = await Assert.ThrowsAsync<PostgresException>(
            () => migrationContext.Database.MigrateAsync());

        Assert.Contains(
            "duplicate unscoped grants",
            exception.Message,
            StringComparison.OrdinalIgnoreCase);
    }
}
