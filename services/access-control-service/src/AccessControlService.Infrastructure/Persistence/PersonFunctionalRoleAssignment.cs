namespace AccessControlService.Infrastructure.Persistence;

public sealed class PersonFunctionalRoleAssignment
{
    public Guid Id { get; set; }
    public Guid PersonId { get; set; }
    public Guid FunctionalRoleId { get; set; }
    public bool IsActive { get; set; }
    public DateTime AssignedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
