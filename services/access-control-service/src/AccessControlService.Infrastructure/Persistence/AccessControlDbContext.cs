using AccessControlService.Domain.Permissions;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// EF Core context for this service's own fixture-only reports-to / department-management schema
/// (Npgsql provider). Deliberately not auto-migrated at startup (see
/// <c>AccessControlService.Api</c>'s <c>Program.cs</c>) -- migrations are applied explicitly (via
/// `dotnet ef database update` locally, or `Database.Migrate()` in tests against an ephemeral
/// instance), preserving the existing "boots fine with Postgres down" health-check test contract.
/// </summary>
public sealed class AccessControlDbContext : DbContext
{
    public AccessControlDbContext(DbContextOptions<AccessControlDbContext> options)
        : base(options)
    {
    }

    public DbSet<Person> People => Set<Person>();

    public DbSet<Department> Departments => Set<Department>();

    public DbSet<ProjectAssignment> ProjectAssignments => Set<ProjectAssignment>();

    public DbSet<ProjectAssignmentEventWatermark> ProjectAssignmentEventWatermarks => Set<ProjectAssignmentEventWatermark>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<FunctionalRole> FunctionalRoles => Set<FunctionalRole>();
    public DbSet<FunctionalRolePermissionGrant> FunctionalRolePermissionGrants => Set<FunctionalRolePermissionGrant>();
    public DbSet<PersonFunctionalRoleAssignment> PersonFunctionalRoleAssignments => Set<PersonFunctionalRoleAssignment>();
    public DbSet<AuthorizationAdministrationAudit> AuthorizationAdministrationAudits => Set<AuthorizationAdministrationAudit>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Department>(department =>
        {
            department.ToTable("departments");
            department.HasKey(d => d.Id);
            department.Property(d => d.Label).IsRequired();

            // Self-referencing parent-department FK. No navigation property is defined in either
            // direction -- IRelationshipRepository queries by id, not by graph traversal, and a
            // navigation here would invite an accidental N+1 include.
            department.HasOne<Department>()
                .WithMany()
                .HasForeignKey(d => d.ParentDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            department.HasData(FixtureSeedData.Departments.Select(d => new Department
            {
                Id = d.Id,
                Label = d.Label,
                ParentDepartmentId = d.ParentDepartmentId,
            }));
        });

        modelBuilder.Entity<Person>(person =>
        {
            person.ToTable("people");
            person.HasKey(p => p.Id);
            person.Property(p => p.Label).IsRequired();

            // Self-referencing reports-to FK. No navigation property, for the same reason as
            // Department's self-reference above: IRelationshipRepository queries by id, never by
            // graph traversal.
            person.HasOne<Person>()
                .WithMany()
                .HasForeignKey(p => p.ManagerId)
                .OnDelete(DeleteBehavior.Restrict);

            // Self-referencing PP-assignment FK -- same no-navigation-property rationale as the
            // reports-to self-reference above.
            person.HasOne<Person>()
                .WithMany()
                .HasForeignKey(p => p.PeoplePartnerId)
                .OnDelete(DeleteBehavior.Restrict);

            person.HasOne<Department>()
                .WithMany()
                .HasForeignKey(p => p.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            person.HasOne<Department>()
                .WithMany()
                .HasForeignKey(p => p.ManagesDepartmentId)
                .OnDelete(DeleteBehavior.Restrict);

            // A department can have at most one manager -- enforce "one manager per department"
            // as a database constraint so a duplicate is a write-time error, not a silent
            // ambiguity for GetDepartmentManagerIdAsync to resolve arbitrarily.
            person.HasIndex(p => p.ManagesDepartmentId).IsUnique();

            person.HasData(FixtureSeedData.People.Select(p => new Person
            {
                Id = p.Id,
                Label = p.Label,
                ManagerId = p.ManagerId,
                PeoplePartnerId = p.PeoplePartnerId,
                DepartmentId = p.DepartmentId,
                ManagesDepartmentId = p.ManagesDepartmentId,
            }));
        });

        modelBuilder.Entity<ProjectAssignment>(projectAssignment =>
        {
            projectAssignment.ToTable("project_assignments");
            projectAssignment.HasKey(pa => pa.Id);
            projectAssignment.Property(pa => pa.Role).IsRequired();

            // FK to Person only -- ProjectId is a deliberately opaque grouping id with no table of
            // its own, see ProjectAssignment's doc comment.
            projectAssignment.HasOne<Person>()
                .WithMany()
                .HasForeignKey(pa => pa.PersonId)
                .OnDelete(DeleteBehavior.Restrict);

            // A person appears at most once per project, in exactly one role -- a database
            // constraint so a duplicate assignment is a write-time error, not a silent ambiguity
            // for the two Project-line lookups to resolve arbitrarily.
            projectAssignment.HasIndex(pa => new { pa.ProjectId, pa.PersonId }).IsUnique();

            projectAssignment.HasData(FixtureSeedData.ProjectAssignments.Select(pa => new ProjectAssignment
            {
                Id = pa.Id,
                ProjectId = pa.ProjectId,
                PersonId = pa.PersonId,
                Role = pa.Role,
            }));
        });

        modelBuilder.Entity<ProjectAssignmentEventWatermark>(watermark =>
        {
            watermark.ToTable("project_assignment_event_watermarks");
            watermark.HasKey(w => w.AggregateId);

            // AggregateId is always caller-supplied (copied from the event's own AggregateId),
            // never database-generated -- make that explicit rather than relying on EF Core's
            // implicit non-default-Guid-key convention.
            watermark.Property(w => w.AggregateId).ValueGeneratedNever();

            watermark.Property(w => w.LastAppliedVersion).IsRequired();
            watermark.Property(w => w.LastAppliedEventId).IsRequired();

            // Enforced as a database constraint, not just processor-side logic: at most one
            // aggregate may claim a given (ProjectId, PersonId) pair at a time. The processor's own
            // cross-aggregate-conflict check is meant to prevent this from ever being attempted, but
            // this index turns any bug in that check (or a future concurrent-write race -- see
            // deferred-work.md) into a write-time error instead of a silent, undetected ownership
            // clash -- same defensive-constraint style as ProjectAssignment's own unique index.
            // Filtered so releasing ownership (both columns null after a revoke) never collides.
            watermark.HasIndex(w => new { w.OwnedProjectId, w.OwnedPersonId })
                .IsUnique()
                .HasFilter("\"OwnedProjectId\" IS NOT NULL AND \"OwnedPersonId\" IS NOT NULL");
        });

        modelBuilder.Entity<Permission>(permission =>
        {
            permission.ToTable("permissions");
            permission.HasKey(p => p.Id);
            permission.Property(p => p.Key).HasMaxLength(100).IsRequired();
            permission.HasIndex(p => p.Key).IsUnique();
            permission.HasData(FixtureSeedData.Permissions);
        });

        modelBuilder.Entity<FunctionalRole>(role =>
        {
            role.ToTable("functional_roles");
            role.HasKey(r => r.Id);
            role.Property(r => r.RoleKey).HasMaxLength(100).IsRequired();
            role.Property(r => r.DisplayName).HasMaxLength(200).IsRequired();
            role.HasIndex(r => r.RoleKey).IsUnique();
            role.HasIndex(r => r.DisplayName).IsUnique();
            role.HasData(FixtureSeedData.FunctionalRoles);
        });

        modelBuilder.Entity<FunctionalRolePermissionGrant>(grant =>
        {
            grant.ToTable("functional_role_permission_grants");
            grant.HasKey(g => g.Id);
            grant.Property(g => g.Scope).HasColumnType("jsonb");
            grant.HasIndex(g => new { g.FunctionalRoleId, g.PermissionId })
                .IsUnique()
                .HasFilter("\"Scope\" IS NULL");
            grant.HasIndex(g => new { g.FunctionalRoleId, g.PermissionId, g.Scope })
                .IsUnique()
                .HasFilter("\"Scope\" IS NOT NULL");
            grant.HasOne<FunctionalRole>()
                .WithMany()
                .HasForeignKey(g => g.FunctionalRoleId)
                .OnDelete(DeleteBehavior.Restrict);
            grant.HasOne<Permission>()
                .WithMany()
                .HasForeignKey(g => g.PermissionId)
                .OnDelete(DeleteBehavior.Restrict);
            grant.HasData(FixtureSeedData.FunctionalRolePermissionGrants);
        });

        modelBuilder.Entity<PersonFunctionalRoleAssignment>(assignment =>
        {
            assignment.ToTable("person_functional_role_assignments");
            assignment.HasKey(a => a.Id);
            assignment.HasIndex(a => new { a.PersonId, a.FunctionalRoleId })
                .IsUnique()
                .HasFilter("\"IsActive\" = TRUE");
            assignment.HasOne<Person>()
                .WithMany()
                .HasForeignKey(a => a.PersonId)
                .OnDelete(DeleteBehavior.Restrict);
            assignment.HasOne<FunctionalRole>()
                .WithMany()
                .HasForeignKey(a => a.FunctionalRoleId)
                .OnDelete(DeleteBehavior.Restrict);
            assignment.HasData(FixtureSeedData.PersonFunctionalRoleAssignments);
        });

        modelBuilder.Entity<AuthorizationAdministrationAudit>(audit =>
        {
            audit.ToTable("authorization_administration_audits");
            audit.HasKey(a => a.AuditId);
            audit.Property(a => a.Action).HasMaxLength(50).IsRequired();
            audit.Property(a => a.TargetType).HasMaxLength(50).IsRequired();
            audit.Property(a => a.TrustedProvisioningActor).HasMaxLength(255);
            audit.Property(a => a.PermissionKey).HasMaxLength(100);
            audit.Property(a => a.Scope).HasColumnType("jsonb");
            audit.Property(a => a.Before).HasColumnType("jsonb");
            audit.Property(a => a.After).HasColumnType("jsonb");
            audit.Property(a => a.CorrelationId).HasMaxLength(100).IsRequired();
            audit.Property(a => a.IdempotencyKey).HasMaxLength(255);
            audit.HasIndex(a => a.IdempotencyKey).IsUnique();
            audit.HasIndex(a => a.OccurredAtUtc);
            audit.HasOne<Person>()
                .WithMany()
                .HasForeignKey(a => a.ActorPersonId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
