using System.Data;
using System.Text.Json;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Identity;

public sealed class FunctionalRoleBootstrapProvisioningService : IBootstrapProvisioningService
{
    private const string SEEDED_ADMINISTRATOR_ROLE_KEY = "hr-admin";

    private readonly AccessControlDbContext dbContext;
    private readonly IPrincipalPersonResolver principalResolver;
    private readonly FunctionalRoleReconciliationService reconciliationService;

    public FunctionalRoleBootstrapProvisioningService(
        AccessControlDbContext dbContext,
        IPrincipalPersonResolver principalResolver,
        FunctionalRoleReconciliationService reconciliationService)
    {
        this.dbContext = dbContext;
        this.principalResolver = principalResolver;
        this.reconciliationService = reconciliationService;
    }

    public async Task<BootstrapProvisioningResult> ProvisionAsync(
        BootstrapProvisioningRequest request,
        string correlationId,
        CancellationToken cancellationToken = default)
    {
        if (!IsValidPrincipalSub(request.PrincipalSub))
        {
            return BootstrapProvisioningResult.InvalidInput();
        }

        PrincipalPersonResolution resolution =
            await principalResolver.ResolvePersonAsync(request.PrincipalSub!, cancellationToken);
        if (resolution is PrincipalPersonResolution.Unavailable)
        {
            return BootstrapProvisioningResult.UnavailableIdentity();
        }

        if (resolution is PrincipalPersonResolution.Ambiguous)
        {
            return BootstrapProvisioningResult.AmbiguousIdentity();
        }

        if (resolution is not PrincipalPersonResolution.Resolved resolved)
        {
            return BootstrapProvisioningResult.UnavailableIdentity();
        }

        try
        {
            await using Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction transaction =
                await dbContext.Database.BeginTransactionAsync(
                    IsolationLevel.ReadCommitted,
                    cancellationToken);

            await reconciliationService.ReconcileWithinTransactionAsync(cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            await dbContext.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT \"Id\" FROM permissions WHERE \"Key\" = {PermissionCatalogue.MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS} FOR UPDATE",
                cancellationToken);

            FunctionalRole? role = await dbContext.FunctionalRoles
                .SingleOrDefaultAsync(
                    candidate => candidate.RoleKey == SEEDED_ADMINISTRATOR_ROLE_KEY &&
                                 candidate.IsSeeded &&
                                 candidate.IsActive,
                    cancellationToken);
            if (role is null)
            {
                return BootstrapProvisioningResult.MissingSeededRole();
            }

            await dbContext.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT \"Id\" FROM functional_roles WHERE \"Id\" = {role.Id} FOR UPDATE",
                cancellationToken);

            PersonFunctionalRoleAssignment? existingAssignment =
                await dbContext.PersonFunctionalRoleAssignments
                    .AsNoTracking()
                    .SingleOrDefaultAsync(
                        assignment => assignment.PersonId == resolved.PersonId &&
                                      assignment.FunctionalRoleId == role.Id &&
                                      assignment.IsActive,
                        cancellationToken);
            if (existingAssignment is not null)
            {
                await transaction.CommitAsync(cancellationToken);
                return BootstrapProvisioningResult.AlreadyProvisioned();
            }

            PersonFunctionalRoleAssignment assignment = new()
            {
                Id = Guid.NewGuid(),
                PersonId = resolved.PersonId,
                FunctionalRoleId = role.Id,
                IsActive = true,
                AssignedAtUtc = DateTime.UtcNow,
            };
            dbContext.PersonFunctionalRoleAssignments.Add(assignment);
            dbContext.AuthorizationAdministrationAudits.Add(
                new AuthorizationAdministrationAudit
                {
                    AuditId = Guid.NewGuid(),
                    Action = "bootstrap",
                    TargetType = "person-functional-role-assignment",
                    TargetId = assignment.Id,
                    TrustedProvisioningActor = request.PrincipalSub,
                    After = JsonSerializer.Serialize(new
                    {
                        assignment.Id,
                        assignment.PersonId,
                        assignment.FunctionalRoleId,
                        assignment.IsActive,
                    }),
                    OccurredAtUtc = DateTime.UtcNow,
                    CorrelationId = correlationId,
                });

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return BootstrapProvisioningResult.Provisioned();
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return BootstrapProvisioningResult.PersistenceOrAuditFailure();
        }
    }

    private static bool IsValidPrincipalSub(string? principalSub) =>
        !string.IsNullOrWhiteSpace(principalSub) &&
        principalSub.Length <= 255 &&
        principalSub.All(character => !char.IsWhiteSpace(character));
}
