using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Permissions;

public sealed class FunctionalRoleAdministrationService
{
    private const string MANAGE_PERMISSION = PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS;
    private static readonly Regex RoleKeyPattern = new("^[a-z0-9]+(?:-[a-z0-9]+)*$", RegexOptions.Compiled);

    private readonly AccessControlDbContext dbContext;
    private readonly IPrincipalPersonResolver principalResolver;

    public FunctionalRoleAdministrationService(
        AccessControlDbContext dbContext,
        IPrincipalPersonResolver principalResolver)
    {
        this.dbContext = dbContext;
        this.principalResolver = principalResolver;
    }

    public async Task<IReadOnlyList<Permission>> GetCatalogueAsync(CancellationToken cancellationToken) =>
        await dbContext.Permissions
            .AsNoTracking()
            .Where(permission => permission.IsActive)
            .OrderBy(permission => permission.Key)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<FunctionalRole>> GetRolesAsync(CancellationToken cancellationToken) =>
        await dbContext.FunctionalRoles
            .AsNoTracking()
            .Where(role => role.IsActive)
            .OrderBy(role => role.RoleKey)
            .ToListAsync(cancellationToken);

    public async Task<AdministrationOperationalState> GetOperationalStateAsync(
        CancellationToken cancellationToken)
    {
        bool hasActiveAdministrator = await (
            from assignment in dbContext.PersonFunctionalRoleAssignments.AsNoTracking()
            join role in dbContext.FunctionalRoles.AsNoTracking()
                on assignment.FunctionalRoleId equals role.Id
            join grant in dbContext.FunctionalRolePermissionGrants.AsNoTracking()
                on role.Id equals grant.FunctionalRoleId
            join permission in dbContext.Permissions.AsNoTracking()
                on grant.PermissionId equals permission.Id
            where assignment.IsActive &&
                  role.IsActive &&
                  permission.IsActive &&
                  permission.Key == MANAGE_PERMISSION &&
                  grant.Scope == null
            select assignment.Id).AnyAsync(cancellationToken);

        return hasActiveAdministrator
            ? AdministrationOperationalState.HasActiveAdministrator
            : AdministrationOperationalState.NoActiveAdministrator;
    }

    public async Task<FunctionalRole?> GetRoleAsync(string roleKey, CancellationToken cancellationToken)
    {
        ValidateRoleKey(roleKey);
        return await dbContext.FunctionalRoles
            .AsNoTracking()
            .SingleOrDefaultAsync(role => role.RoleKey == roleKey && role.IsActive, cancellationToken);
    }

    public async Task<IReadOnlyList<FunctionalRolePermissionView>> GetRolePermissionsAsync(
        string roleKey,
        CancellationToken cancellationToken)
    {
        ValidateRoleKey(roleKey);

        FunctionalRole? role = await dbContext.FunctionalRoles
            .AsNoTracking()
            .SingleOrDefaultAsync(
                candidate => candidate.RoleKey == roleKey && candidate.IsActive,
                cancellationToken);
        if (role is null)
        {
            throw new NotFoundException("The functional role was not found.");
        }

        var storedGrants = await (
            from grant in dbContext.FunctionalRolePermissionGrants.AsNoTracking()
            join permission in dbContext.Permissions.AsNoTracking()
                on grant.PermissionId equals permission.Id
            where grant.FunctionalRoleId == role.Id &&
                  permission.IsActive
            select new
            {
                grant.Id,
                permission.Key,
                grant.Scope,
            })
            .ToListAsync(cancellationToken);

        return storedGrants
            .Select(grant => new FunctionalRolePermissionView(
                grant.Id,
                grant.Key,
                NormalizeStoredScope(grant.Scope)))
            .OrderBy(grant => grant.PermissionKey)
            .ThenBy(grant => grant.Scope ?? string.Empty)
            .ThenBy(grant => grant.Id)
            .ToArray();
    }

    public async Task<FunctionalRole> CreateRoleAsync(
        Guid actorPersonId,
        string roleKey,
        string displayName,
        string correlationId,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        ValidateRole(roleKey, displayName);
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);

        FunctionalRole? existing = await FindIdempotentRoleAsync(
            idempotencyKey,
            roleKey,
            displayName,
            cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        if (await dbContext.FunctionalRoles.AnyAsync(
                role => role.RoleKey == roleKey || role.DisplayName == displayName,
                cancellationToken))
        {
            throw new RoleConflictException("The role key or display name is already in use.");
        }

        var role = new FunctionalRole
        {
            Id = Guid.NewGuid(),
            RoleKey = roleKey,
            DisplayName = displayName,
            IsSeeded = false,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };

        await ExecuteMutationAsync(
            actorPersonId,
            "role-create",
            "functional-role",
            role.Id,
            before: null,
            after: SerializeRole(role),
            correlationId,
            idempotencyKey,
            async () =>
            {
                dbContext.FunctionalRoles.Add(role);
                await dbContext.SaveChangesAsync(cancellationToken);
            },
            cancellationToken);

        return role;
    }

    public async Task<FunctionalRole> UpdateRoleAsync(
        Guid actorPersonId,
        string roleKey,
        string displayName,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ValidateRole(roleKey, displayName);
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);

        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);
        if (role.DisplayName == displayName)
        {
            return role;
        }

        if (await dbContext.FunctionalRoles.AnyAsync(
                candidate => candidate.Id != role.Id &&
                             candidate.DisplayName == displayName,
                cancellationToken))
        {
            throw new RoleConflictException("The display name is already in use.");
        }

        string before = SerializeRole(role);
        role.DisplayName = displayName;

        await ExecuteMutationAsync(
            actorPersonId,
            "role-update",
            "functional-role",
            role.Id,
            before,
            SerializeRole(role),
            correlationId,
            idempotencyKey: null,
            () => dbContext.SaveChangesAsync(cancellationToken),
            cancellationToken);

        return role;
    }

    public async Task<FunctionalRole> DeactivateRoleAsync(
        Guid actorPersonId,
        string roleKey,
        string reason,
        string correlationId,
        CancellationToken cancellationToken)
    {
        ValidateRoleKey(roleKey);
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new ValidationException("A deactivation reason is required.");
        }

        await EnsureAdministratorAsync(actorPersonId, cancellationToken);
        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);

        if (!role.IsActive)
        {
            return role;
        }

        if (role.IsSeeded)
        {
            throw new RoleConflictException("Seeded roles cannot be deactivated.");
        }

        if (await dbContext.PersonFunctionalRoleAssignments.AnyAsync(
                assignment => assignment.FunctionalRoleId == role.Id && assignment.IsActive,
                cancellationToken))
        {
            throw new RoleConflictException("A role with active assignments cannot be deactivated.");
        }

        string before = SerializeRole(role);
        role.IsActive = false;
        role.DeactivatedAtUtc = DateTime.UtcNow;

        await ExecuteMutationAsync(
            actorPersonId,
            "role-deactivate",
            "functional-role",
            role.Id,
            before,
            SerializeRole(role),
            correlationId,
            idempotencyKey: null,
            () => dbContext.SaveChangesAsync(cancellationToken),
            cancellationToken);

        return role;
    }

    public async Task<FunctionalRolePermissionGrant> GrantPermissionAsync(
        Guid actorPersonId,
        string roleKey,
        string permissionKey,
        string? scope,
        string correlationId,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        string? normalizedScope = PermissionScopeValidator.ValidateAndNormalize(permissionKey, scope);
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);
        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);
        if (!role.IsActive)
        {
            throw new NotFoundException("The functional role was not found.");
        }
        Permission permission = await GetRequiredPermissionAsync(permissionKey, cancellationToken);

        FunctionalRolePermissionGrant? existing = await dbContext.FunctionalRolePermissionGrants
            .SingleOrDefaultAsync(
                grant => grant.FunctionalRoleId == role.Id &&
                         grant.PermissionId == permission.Id &&
                         grant.Scope == normalizedScope,
                cancellationToken);
        if (existing is not null)
        {
            await EnsureIdempotencyKeyMatchesAsync(
                idempotencyKey,
                "permission-grant",
                permissionKey,
                normalizedScope,
                role.Id,
                cancellationToken);
            return existing;
        }

        AuthorizationAdministrationAudit? replayAudit =
            await FindIdempotencyAuditAsync(idempotencyKey, cancellationToken);
        if (replayAudit is not null)
        {
            EnsureIdempotencyRequestMatches(
                replayAudit,
                "permission-grant",
                permissionKey,
                normalizedScope,
                role.Id);
            FunctionalRolePermissionGrant? replayGrant =
                await dbContext.FunctionalRolePermissionGrants.SingleOrDefaultAsync(
                    grant => grant.Id == replayAudit.TargetId,
                    cancellationToken);
            return replayGrant ?? throw new IdempotencyConflictException(
                "The idempotency key does not identify an existing grant.");
        }

        var grant = new FunctionalRolePermissionGrant
        {
            Id = Guid.NewGuid(),
            FunctionalRoleId = role.Id,
            PermissionId = permission.Id,
            Scope = normalizedScope,
            GrantedAtUtc = DateTime.UtcNow,
        };

        await ExecuteMutationAsync(
            actorPersonId,
            "permission-grant",
            "functional-role-permission-grant",
            grant.Id,
            null,
            SerializeGrant(grant, permissionKey),
            correlationId,
            idempotencyKey,
            async () =>
            {
                dbContext.FunctionalRolePermissionGrants.Add(grant);
                await dbContext.SaveChangesAsync(cancellationToken);
            },
            cancellationToken,
            auditPermissionKey: permissionKey,
            auditScope: normalizedScope);

        return grant;
    }

    public async Task RevokePermissionAsync(
        Guid actorPersonId,
        string roleKey,
        string permissionKey,
        string? scope,
        string correlationId,
        CancellationToken cancellationToken)
    {
        string? normalizedScope = PermissionScopeValidator.ValidateAndNormalize(permissionKey, scope);
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);
        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);
        Permission permission = await GetRequiredPermissionAsync(permissionKey, cancellationToken);
        FunctionalRolePermissionGrant? grant = await dbContext.FunctionalRolePermissionGrants
            .SingleOrDefaultAsync(
                candidate => candidate.FunctionalRoleId == role.Id &&
                             candidate.PermissionId == permission.Id &&
                             candidate.Scope == normalizedScope,
                cancellationToken);

        if (grant is null)
        {
            return;
        }

        string before = SerializeGrant(grant, permissionKey);
        await ExecuteMutationAsync(
            actorPersonId,
            "permission-revoke",
            "functional-role-permission-grant",
            grant.Id,
            before,
            null,
            correlationId,
            idempotencyKey: null,
            async () =>
            {
                if (permissionKey == MANAGE_PERMISSION &&
                    await CountPermissionHoldersAsync(
                        excludedGrantId: grant.Id,
                        cancellationToken: cancellationToken) == 0)
                {
                    throw new RoleConflictException("The final active administrator cannot be removed.");
                }

                dbContext.FunctionalRolePermissionGrants.Remove(grant);
                await dbContext.SaveChangesAsync(cancellationToken);
            },
            cancellationToken,
            lockAdministration: permissionKey == MANAGE_PERMISSION,
            auditPermissionKey: permissionKey,
            auditScope: normalizedScope);
    }

    public async Task<AssignmentOperationResult> AssignRoleAsync(
        Guid actorPersonId,
        Guid personId,
        string roleKey,
        string correlationId,
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);
        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);
        if (!role.IsActive)
        {
            throw new NotFoundException("The functional role was not found.");
        }

        if (!await dbContext.People.AnyAsync(person => person.Id == personId, cancellationToken))
        {
            throw new NotFoundException("The person was not found.");
        }

        PersonFunctionalRoleAssignment? existing = await dbContext.PersonFunctionalRoleAssignments
            .SingleOrDefaultAsync(
                assignment => assignment.PersonId == personId &&
                               assignment.FunctionalRoleId == role.Id &&
                               assignment.IsActive,
                cancellationToken);
        if (existing is not null)
        {
            await EnsureIdempotencyKeyMatchesAsync(
                idempotencyKey,
                "assignment-create",
                null,
                null,
                role.Id,
                cancellationToken,
                personId);
            return new AssignmentOperationResult(existing, Created: false);
        }

        AuthorizationAdministrationAudit? replayAudit =
            await FindIdempotencyAuditAsync(idempotencyKey, cancellationToken);
        if (replayAudit is not null)
        {
            EnsureIdempotencyRequestMatches(
                replayAudit,
                "assignment-create",
                permissionKey: null,
                scope: null,
                role.Id,
                personId);
            PersonFunctionalRoleAssignment? replayAssignment =
                await dbContext.PersonFunctionalRoleAssignments.SingleOrDefaultAsync(
                    assignment => assignment.Id == replayAudit.TargetId,
                    cancellationToken);
            return replayAssignment is null
                ? throw new IdempotencyConflictException("The idempotency key does not identify an existing assignment.")
                : new AssignmentOperationResult(replayAssignment, Created: false);
        }

        var assignment = new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = personId,
            FunctionalRoleId = role.Id,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        };

        await ExecuteMutationAsync(
            actorPersonId,
            "assignment-create",
            "person-functional-role-assignment",
            assignment.Id,
            null,
            SerializeAssignment(assignment),
            correlationId,
            idempotencyKey,
            async () =>
            {
                dbContext.PersonFunctionalRoleAssignments.Add(assignment);
                await dbContext.SaveChangesAsync(cancellationToken);
            },
            cancellationToken);

        return new AssignmentOperationResult(assignment, Created: true);
    }

    public async Task RevokeRoleAsync(
        Guid actorPersonId,
        Guid personId,
        string roleKey,
        string correlationId,
        CancellationToken cancellationToken)
    {
        await EnsureAdministratorAsync(actorPersonId, cancellationToken);
        FunctionalRole role = await GetRequiredRoleAsync(roleKey, cancellationToken);
        PersonFunctionalRoleAssignment? assignment = await dbContext.PersonFunctionalRoleAssignments
            .SingleOrDefaultAsync(
                candidate => candidate.PersonId == personId &&
                             candidate.FunctionalRoleId == role.Id &&
                             candidate.IsActive,
                cancellationToken);

        if (assignment is null)
        {
            return;
        }

        string before = SerializeAssignment(assignment);
        await ExecuteMutationAsync(
            actorPersonId,
            "assignment-revoke",
            "person-functional-role-assignment",
            assignment.Id,
            before,
            null,
            correlationId,
            idempotencyKey: null,
            async () =>
            {
                if (await IsAdministratorRoleAsync(role.Id, cancellationToken) &&
                    await CountPermissionHoldersAsync(
                        excludedAssignmentId: assignment.Id,
                        cancellationToken: cancellationToken) == 0)
                {
                    throw new RoleConflictException("The final active administrator cannot be removed.");
                }

                assignment.IsActive = false;
                assignment.RevokedAtUtc = DateTime.UtcNow;
                await dbContext.SaveChangesAsync(cancellationToken);
            },
            cancellationToken,
            lockAdministration: true,
            afterFactory: () => SerializeAssignment(assignment));
    }

    public async Task<IReadOnlyList<AssignmentView>> GetAssignmentsAsync(
        Guid personId,
        CancellationToken cancellationToken)
    {
        await EnsurePersonExistsAsync(personId, cancellationToken);
        return await dbContext.PersonFunctionalRoleAssignments
            .AsNoTracking()
            .Join(
                dbContext.FunctionalRoles.AsNoTracking(),
                assignment => assignment.FunctionalRoleId,
                role => role.Id,
                (assignment, role) => new
                {
                    Assignment = assignment,
                    role.RoleKey,
                    role.IsActive,
                })
            .Where(view => view.Assignment.PersonId == personId &&
                           view.Assignment.IsActive &&
                           view.IsActive)
            .OrderBy(view => view.Assignment.AssignedAtUtc)
            .Select(view => new AssignmentView(view.Assignment, view.RoleKey))
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> CheckPermissionAsync(
        Guid actorPersonId,
        string permissionKey,
        string? scope,
        CancellationToken cancellationToken)
    {
        string? normalizedScope = PermissionScopeValidator.ValidateAndNormalize(permissionKey, scope);
        return await (
            from assignment in dbContext.PersonFunctionalRoleAssignments.AsNoTracking()
            join grant in dbContext.FunctionalRolePermissionGrants.AsNoTracking()
                on assignment.FunctionalRoleId equals grant.FunctionalRoleId
            join permission in dbContext.Permissions.AsNoTracking()
                on grant.PermissionId equals permission.Id
            join role in dbContext.FunctionalRoles.AsNoTracking()
                on assignment.FunctionalRoleId equals role.Id
            where assignment.PersonId == actorPersonId &&
                  assignment.IsActive &&
                  role.IsActive &&
                  permission.IsActive &&
                  permission.Key == permissionKey &&
                  grant.Scope == normalizedScope
            select grant.Id).AnyAsync(cancellationToken);
    }

    public async Task EnsureAdministratorAsync(Guid actorPersonId, CancellationToken cancellationToken)
    {
        if (!await CheckPermissionAsync(actorPersonId, MANAGE_PERMISSION, null, cancellationToken))
        {
            throw new ForbiddenException("The principal lacks functional-role administration permission.");
        }
    }

    private async Task<FunctionalRole> GetRequiredRoleAsync(string roleKey, CancellationToken cancellationToken) =>
        await GetValidatedRoleAsync(roleKey, cancellationToken) ??
        throw new NotFoundException("The functional role was not found.");

    private async Task<FunctionalRole?> GetValidatedRoleAsync(
        string roleKey,
        CancellationToken cancellationToken)
    {
        ValidateRoleKey(roleKey);
        return await dbContext.FunctionalRoles.SingleOrDefaultAsync(
            role => role.RoleKey == roleKey,
            cancellationToken);
    }

    private async Task<Permission> GetRequiredPermissionAsync(
        string permissionKey,
        CancellationToken cancellationToken) =>
        await dbContext.Permissions.SingleOrDefaultAsync(
            permission => permission.Key == permissionKey && permission.IsActive,
            cancellationToken) ??
        throw new NotFoundException("The permission was not found.");

    private async Task EnsurePersonExistsAsync(Guid personId, CancellationToken cancellationToken)
    {
        if (!await dbContext.People.AnyAsync(person => person.Id == personId, cancellationToken))
        {
            throw new NotFoundException("The person was not found.");
        }
    }

    private async Task<bool> IsAdministratorRoleAsync(Guid roleId, CancellationToken cancellationToken) =>
        await (
            from grant in dbContext.FunctionalRolePermissionGrants
            join permission in dbContext.Permissions on grant.PermissionId equals permission.Id
            where grant.FunctionalRoleId == roleId &&
                  permission.Key == MANAGE_PERMISSION
            select grant.Id).AnyAsync(cancellationToken);

    private async Task<int> CountPermissionHoldersAsync(
        Guid? excludedGrantId = null,
        Guid? excludedAssignmentId = null,
        CancellationToken cancellationToken = default)
    {
        IQueryable<Guid> holders =
            from assignment in dbContext.PersonFunctionalRoleAssignments
            join role in dbContext.FunctionalRoles on assignment.FunctionalRoleId equals role.Id
            join grant in dbContext.FunctionalRolePermissionGrants
                on role.Id equals grant.FunctionalRoleId
            join permission in dbContext.Permissions on grant.PermissionId equals permission.Id
            where assignment.IsActive &&
                  role.IsActive &&
                  permission.IsActive &&
                  permission.Key == MANAGE_PERMISSION &&
                  grant.Scope == null &&
                  (!excludedGrantId.HasValue || grant.Id != excludedGrantId.Value) &&
                  (!excludedAssignmentId.HasValue || assignment.Id != excludedAssignmentId.Value)
            select assignment.PersonId;

        return await holders.Distinct().CountAsync(cancellationToken);
    }

    private async Task<FunctionalRole?> FindIdempotentRoleAsync(
        string? idempotencyKey,
        string roleKey,
        string displayName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            return null;
        }

        AuthorizationAdministrationAudit? audit = await dbContext.AuthorizationAdministrationAudits
            .AsNoTracking()
            .SingleOrDefaultAsync(a => a.IdempotencyKey == idempotencyKey, cancellationToken);
        if (audit is null)
        {
            return null;
        }

        if (audit.Action != "role-create" ||
            audit.TargetType != "functional-role" ||
            audit.After is null)
        {
            throw new IdempotencyConflictException("The idempotency key was already used for another request.");
        }

        using JsonDocument document = JsonDocument.Parse(audit.After);
        JsonElement root = document.RootElement;
        if (!root.TryGetProperty("RoleKey", out JsonElement storedRoleKey) ||
            !root.TryGetProperty("DisplayName", out JsonElement storedDisplayName) ||
            storedRoleKey.GetString() != roleKey ||
            storedDisplayName.GetString() != displayName)
        {
            throw new IdempotencyConflictException("The idempotency key was already used for another request.");
        }

        if (audit.TargetId is null)
        {
            throw new IdempotencyConflictException("The idempotency key does not identify an existing role.");
        }

        return await dbContext.FunctionalRoles.SingleOrDefaultAsync(
            role => role.Id == audit.TargetId.Value,
            cancellationToken);
    }

    private async Task<AuthorizationAdministrationAudit?> FindIdempotencyAuditAsync(
        string? idempotencyKey,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            return null;
        }

        return await dbContext.AuthorizationAdministrationAudits
            .AsNoTracking()
            .SingleOrDefaultAsync(audit => audit.IdempotencyKey == idempotencyKey, cancellationToken);
    }

    private async Task EnsureIdempotencyKeyMatchesAsync(
        string? idempotencyKey,
        string action,
        string? permissionKey,
        string? scope,
        Guid roleId,
        CancellationToken cancellationToken,
        Guid? personId = null)
    {
        AuthorizationAdministrationAudit? audit =
            await FindIdempotencyAuditAsync(idempotencyKey, cancellationToken);
        if (audit is not null)
        {
            EnsureIdempotencyRequestMatches(
                audit,
                action,
                permissionKey,
                scope,
                roleId,
                personId);
        }
    }

    private static void EnsureIdempotencyRequestMatches(
        AuthorizationAdministrationAudit audit,
        string action,
        string? permissionKey,
        string? scope,
        Guid roleId,
        Guid? personId = null)
    {
        if (audit.Action != action ||
            audit.PermissionKey != permissionKey ||
            audit.Scope != scope ||
            audit.After is null)
        {
            throw new IdempotencyConflictException("The idempotency key was already used for another request.");
        }

        using JsonDocument document = JsonDocument.Parse(audit.After);
        JsonElement root = document.RootElement;
        if (!root.TryGetProperty("FunctionalRoleId", out JsonElement storedRoleId) ||
            storedRoleId.GetGuid() != roleId ||
            (personId.HasValue &&
             (!root.TryGetProperty("PersonId", out JsonElement storedPersonId) ||
              storedPersonId.GetGuid() != personId.Value)))
        {
            throw new IdempotencyConflictException("The idempotency key was already used for another request.");
        }
    }

    private async Task ExecuteMutationAsync(
        Guid actorPersonId,
        string action,
        string targetType,
        Guid targetId,
        string? before,
        string? after,
        string correlationId,
        string? idempotencyKey,
        Func<Task> mutation,
        CancellationToken cancellationToken,
        string? auditPermissionKey = null,
        string? auditScope = null,
        bool lockAdministration = false,
        Func<string?>? afterFactory = null)
    {
        await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction =
            await dbContext.Database.BeginTransactionAsync(
                IsolationLevel.ReadCommitted,
                cancellationToken);
        if (lockAdministration)
        {
            await dbContext.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT \"Id\" FROM permissions WHERE \"Key\" = {MANAGE_PERMISSION} FOR UPDATE",
                cancellationToken);
        }
        await mutation();
        dbContext.AuthorizationAdministrationAudits.Add(new AuthorizationAdministrationAudit
        {
            AuditId = Guid.NewGuid(),
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            ActorPersonId = actorPersonId,
            PermissionKey = auditPermissionKey,
            Scope = auditScope,
            Before = before,
            After = afterFactory?.Invoke() ?? after,
            OccurredAtUtc = DateTime.UtcNow,
            CorrelationId = correlationId,
            IdempotencyKey = idempotencyKey,
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private static void ValidateRole(string roleKey, string displayName)
    {
        ValidateRoleKey(roleKey);
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 200)
        {
            throw new ValidationException("Display name must be nonblank and at most 200 characters.");
        }
    }

    private static void ValidateRoleKey(string roleKey)
    {
        if (string.IsNullOrWhiteSpace(roleKey) || roleKey.Length > 100 || !RoleKeyPattern.IsMatch(roleKey))
        {
            throw new ValidationException("Role key must be lowercase kebab-case and at most 100 characters.");
        }
    }

    private static string SerializeRole(FunctionalRole role) =>
        JsonSerializer.Serialize(new { role.Id, role.RoleKey, role.DisplayName, role.IsSeeded, role.IsActive });

    private static string SerializeGrant(FunctionalRolePermissionGrant grant, string permissionKey) =>
        JsonSerializer.Serialize(new { grant.Id, grant.FunctionalRoleId, permissionKey, grant.Scope });

    private static string? NormalizeStoredScope(string? scope)
    {
        if (scope is null)
        {
            return null;
        }

        Dictionary<string, string>? values =
            JsonSerializer.Deserialize<Dictionary<string, string>>(scope);
        return values is null
            ? null
            : JsonSerializer.Serialize(values);
    }

    private static string SerializeAssignment(PersonFunctionalRoleAssignment assignment) =>
        JsonSerializer.Serialize(new
        {
            assignment.Id,
            assignment.PersonId,
            assignment.FunctionalRoleId,
            assignment.IsActive,
            assignment.RevokedAtUtc,
        });
}

public sealed class ValidationException(string message) : Exception(message);
public sealed class ForbiddenException(string message) : Exception(message);
public sealed class NotFoundException(string message) : Exception(message);
public sealed class RoleConflictException(string message) : Exception(message);
public sealed class IdempotencyConflictException(string message) : Exception(message);
public sealed record AssignmentOperationResult(PersonFunctionalRoleAssignment Assignment, bool Created);
public sealed record AssignmentView(PersonFunctionalRoleAssignment Assignment, string RoleKey);
public sealed record FunctionalRolePermissionView(Guid Id, string PermissionKey, string? Scope);

public enum AdministrationOperationalState
{
    NoActiveAdministrator,
    HasActiveAdministrator,
}
