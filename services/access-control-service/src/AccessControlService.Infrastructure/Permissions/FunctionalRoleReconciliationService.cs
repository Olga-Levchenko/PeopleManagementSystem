using System.Text.Json;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Permissions;

public sealed class FunctionalRoleReconciliationService
{
    private const long RECONCILIATION_ADVISORY_LOCK_KEY = 1_401_004_014;
    private readonly AccessControlDbContext dbContext;

    public FunctionalRoleReconciliationService(AccessControlDbContext dbContext)
    {
        this.dbContext = dbContext;
    }

    public async Task<FunctionalRoleReconciliationResult> ReconcileAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction =
                await dbContext.Database.BeginTransactionAsync(cancellationToken);
            FunctionalRoleReconciliationResult result =
                await ReconcileWithinTransactionAsync(cancellationToken);

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return FunctionalRoleReconciliationResult.Failed();
        }
    }

    public async Task<FunctionalRoleReconciliationResult> ReconcileWithinTransactionAsync(
        CancellationToken cancellationToken = default)
    {
        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock({RECONCILIATION_ADVISORY_LOCK_KEY})",
            cancellationToken);

        List<Permission> permissions = await dbContext.Permissions.ToListAsync(cancellationToken);
        Permission? existingAdministrationPermission = permissions.SingleOrDefault(
            permission => permission.Key == PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS);
        if (existingAdministrationPermission is not null)
        {
            await LockAdministrationPermissionAsync(cancellationToken);
        }

        List<FunctionalRole> roles = await dbContext.FunctionalRoles.ToListAsync(cancellationToken);
        List<FunctionalRolePermissionGrant> grants =
            await dbContext.FunctionalRolePermissionGrants.ToListAsync(cancellationToken);

        int createdPermissions = 0;
        int restoredPermissions = 0;
        int createdRoles = 0;
        int restoredRoles = 0;
        int createdGrants = 0;

        Dictionary<string, Permission> permissionsByKey =
            permissions.ToDictionary(permission => permission.Key, StringComparer.Ordinal);
        foreach (Permission seed in FixtureSeedData.Permissions)
        {
            if (!permissionsByKey.TryGetValue(seed.Key, out Permission? permission))
            {
                permission = new Permission
                {
                    Id = seed.Id,
                    Key = seed.Key,
                    IsActive = seed.IsActive,
                    RequiresScope = seed.RequiresScope,
                };
                dbContext.Permissions.Add(permission);
                permissionsByKey.Add(permission.Key, permission);
                createdPermissions++;
                continue;
            }

            if (!permission.IsActive)
            {
                permission.IsActive = true;
                restoredPermissions++;
            }

            if (permission.RequiresScope != seed.RequiresScope)
            {
                permission.RequiresScope = seed.RequiresScope;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await LockAdministrationPermissionAsync(cancellationToken);

        Dictionary<string, FunctionalRole> rolesByKey =
            roles.ToDictionary(role => role.RoleKey, StringComparer.Ordinal);
        foreach (FunctionalRole seed in FixtureSeedData.FunctionalRoles)
        {
            if (!rolesByKey.TryGetValue(seed.RoleKey, out FunctionalRole? role))
            {
                role = new FunctionalRole
                {
                    Id = seed.Id,
                    RoleKey = seed.RoleKey,
                    DisplayName = seed.DisplayName,
                    IsSeeded = true,
                    IsActive = true,
                    CreatedAtUtc = seed.CreatedAtUtc,
                };
                dbContext.FunctionalRoles.Add(role);
                rolesByKey.Add(role.RoleKey, role);
                createdRoles++;
                continue;
            }

            if (!role.IsSeeded)
            {
                throw new InvalidOperationException(
                    $"The canonical role key '{seed.RoleKey}' is occupied by a custom role.");
            }

            if (!role.IsActive)
            {
                role.IsActive = true;
                role.DeactivatedAtUtc = null;
                restoredRoles++;
            }
        }

        foreach (FunctionalRolePermissionGrant seed in FixtureSeedData.FunctionalRolePermissionGrants)
        {
            FunctionalRole seedRole = FixtureSeedData.FunctionalRoles
                .Single(role => role.Id == seed.FunctionalRoleId);
            Permission seedPermission = FixtureSeedData.Permissions
                .Single(permission => permission.Id == seed.PermissionId);
            FunctionalRole role = rolesByKey[seedRole.RoleKey];
            Permission permission = permissionsByKey[seedPermission.Key];
            string? canonicalScope = PermissionScopeValidator.ValidateAndNormalize(
                permission.Key,
                seed.Scope);

            if (grants.Any(grant =>
                    grant.FunctionalRoleId == role.Id &&
                    grant.PermissionId == permission.Id &&
                    ScopesEqual(grant.Scope, canonicalScope)))
            {
                continue;
            }

            if (grants.Any(grant => grant.Id == seed.Id))
            {
                throw new InvalidOperationException(
                    $"The canonical grant identifier '{seed.Id}' is occupied by another grant.");
            }

            FunctionalRolePermissionGrant grant = new()
            {
                Id = seed.Id,
                FunctionalRoleId = role.Id,
                PermissionId = permission.Id,
                Scope = canonicalScope,
                GrantedAtUtc = seed.GrantedAtUtc,
            };
            dbContext.FunctionalRolePermissionGrants.Add(grant);
            grants.Add(grant);
            createdGrants++;
        }

        FunctionalRoleReconciliationStatus status =
            createdPermissions == 0 &&
            restoredPermissions == 0 &&
            createdRoles == 0 &&
            restoredRoles == 0 &&
            createdGrants == 0
                ? FunctionalRoleReconciliationStatus.AlreadyPresent
                : FunctionalRoleReconciliationStatus.Reconciled;

        return new FunctionalRoleReconciliationResult(
            createdPermissions,
            restoredPermissions,
            createdRoles,
            restoredRoles,
            createdGrants,
            status);
    }

    private Task LockAdministrationPermissionAsync(CancellationToken cancellationToken) =>
        dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT \"Id\" FROM permissions WHERE \"Key\" = {PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS} FOR UPDATE",
            cancellationToken);

    private static bool ScopesEqual(string? left, string? right)
    {
        if (left is null || right is null)
        {
            return left is null && right is null;
        }

        Dictionary<string, string>? leftValues =
            JsonSerializer.Deserialize<Dictionary<string, string>>(left);
        Dictionary<string, string>? rightValues =
            JsonSerializer.Deserialize<Dictionary<string, string>>(right);
        return leftValues is not null &&
               rightValues is not null &&
               leftValues.Count == rightValues.Count &&
               leftValues.All(pair =>
                   rightValues.TryGetValue(pair.Key, out string? value) &&
                   string.Equals(pair.Value, value, StringComparison.Ordinal));
    }
}

public enum FunctionalRoleReconciliationStatus
{
    AlreadyPresent,
    Reconciled,
    Failed,
}

public sealed record FunctionalRoleReconciliationResult(
    int CreatedPermissions,
    int RestoredPermissions,
    int CreatedRoles,
    int RestoredRoles,
    int CreatedGrants,
    FunctionalRoleReconciliationStatus Status)
{
    public static FunctionalRoleReconciliationResult Failed() =>
        new(0, 0, 0, 0, 0, FunctionalRoleReconciliationStatus.Failed);
}
