using System.Data;
using System.Text.Json;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Identity;

public sealed class FunctionalRoleRecoveryService : IBootstrapRecoveryService
{
    private const string SEEDED_ADMINISTRATOR_ROLE_KEY = "hr-admin";

    private readonly AccessControlDbContext dbContext;
    private readonly IDeploymentRecoveryAuthorizer recoveryAuthorizer;
    private readonly IPrincipalPersonResolver principalResolver;
    private readonly FunctionalRoleReconciliationService reconciliationService;

    public FunctionalRoleRecoveryService(
        AccessControlDbContext dbContext,
        IDeploymentRecoveryAuthorizer recoveryAuthorizer,
        IPrincipalPersonResolver principalResolver,
        FunctionalRoleReconciliationService reconciliationService)
    {
        this.dbContext = dbContext;
        this.recoveryAuthorizer = recoveryAuthorizer;
        this.principalResolver = principalResolver;
        this.reconciliationService = reconciliationService;
    }

    public async Task<RecoveryProvisioningResult> RecoverBootstrapAdministratorAsync(
        DeploymentAuthenticatedRecoveryRequest request,
        string correlationId,
        CancellationToken cancellationToken = default)
    {
        DeploymentRecoveryAuthorization authorization =
            await recoveryAuthorizer.AuthorizeAsync(request, cancellationToken);
        if (authorization is DeploymentRecoveryAuthorization.Unavailable)
        {
            return RecoveryProvisioningResult.Unavailable();
        }

        if (authorization is DeploymentRecoveryAuthorization.Denied)
        {
            return RecoveryProvisioningResult.Unauthorized();
        }

        if (authorization is not DeploymentRecoveryAuthorization.Authorized authorized ||
            string.IsNullOrWhiteSpace(authorized.Context.OperatorIdentity))
        {
            return RecoveryProvisioningResult.Unauthorized();
        }

        if (!OidcPrincipalIdentity.TryCreate(
                authorized.Context.PrincipalIssuer,
                authorized.Context.PrincipalSub,
                out OidcPrincipalIdentity? identity) ||
            identity is null)
        {
            return RecoveryProvisioningResult.InvalidInput();
        }

        PrincipalPersonResolution resolution =
            await principalResolver.ResolvePersonAsync(
                identity,
                cancellationToken);
        if (resolution is PrincipalPersonResolution.Unavailable)
        {
            return RecoveryProvisioningResult.Unavailable();
        }

        if (resolution is PrincipalPersonResolution.Ambiguous)
        {
            return RecoveryProvisioningResult.AmbiguousIdentity();
        }

        if (resolution is not PrincipalPersonResolution.Resolved resolved)
        {
            return RecoveryProvisioningResult.Unavailable();
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
                return RecoveryProvisioningResult.PersistenceOrAuditFailure();
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
                return RecoveryProvisioningResult.Recovered();
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
                    Action = "recovery",
                    TargetType = "person-functional-role-assignment",
                    TargetId = assignment.Id,
                    TrustedProvisioningActor = authorized.Context.OperatorIdentity,
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
            return RecoveryProvisioningResult.Recovered();
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return RecoveryProvisioningResult.PersistenceOrAuditFailure();
        }
    }

}
