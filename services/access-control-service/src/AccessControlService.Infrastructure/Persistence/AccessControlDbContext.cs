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

    public DbSet<FullProfileAccessGrant> FullProfileAccessGrants => Set<FullProfileAccessGrant>();

    public DbSet<FullProfileAccessJournalEntry> FullProfileAccessJournalEntries => Set<FullProfileAccessJournalEntry>();

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

        modelBuilder.Entity<FullProfileAccessGrant>(grant =>
        {
            grant.ToTable("full_profile_access_grants");
            grant.HasKey(g => g.Id);

            // Application generates the PK (Guid.NewGuid()), not the database -- make that explicit
            // rather than relying on EF Core's implicit non-default-Guid-key ValueGeneratedOnAdd.
            grant.Property(g => g.Id).ValueGeneratedNever();

            grant.Property(g => g.HolderId).IsRequired();
            grant.Property(g => g.GrantedByActorId).IsRequired();
            grant.Property(g => g.GrantedAtUtc).IsRequired();

            // One person can hold at most one active grant at a time -- enforced as a database
            // constraint so a duplicate (e.g. from a race between two concurrent grant calls) is
            // a write-time error rather than a silent duplicate that confuses IsHolderAsync and
            // GetActiveCountAsync.
            grant.HasIndex(g => g.HolderId).IsUnique();

            // Bootstrap seed: PlatformLeadId holds Full-profile-access at deployment, granted by
            // themselves (self-seeded, no prior holder). This is the only self-granted row ever
            // allowed -- subsequent grants must pass the non-self guard in FullProfileAccessController.
            grant.HasData(new FullProfileAccessGrant
            {
                Id = FixtureSeedData.FullProfileAccessGrantBootstrapId,
                HolderId = FixtureSeedData.PlatformLeadId,
                GrantedByActorId = FixtureSeedData.PlatformLeadId,
                GrantedAtUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });
        });

        modelBuilder.Entity<FullProfileAccessJournalEntry>(entry =>
        {
            entry.ToTable("full_profile_access_journal_entries");
            entry.HasKey(e => e.Id);

            // Application generates the PK, not the database.
            entry.Property(e => e.Id).ValueGeneratedNever();

            entry.Property(e => e.ActorId).IsRequired();
            entry.Property(e => e.SubjectId).IsRequired();
            entry.Property(e => e.Action).IsRequired();
            entry.Property(e => e.OccurredAtUtc).IsRequired();

            // Bootstrap seed: mirrors the FullProfileAccessGrant seed row -- the self-grant action
            // at deployment is the first journal entry.
            entry.HasData(new FullProfileAccessJournalEntry
            {
                Id = FixtureSeedData.FullProfileAccessJournalBootstrapId,
                ActorId = FixtureSeedData.PlatformLeadId,
                SubjectId = FixtureSeedData.PlatformLeadId,
                Action = FullProfileAccessAction.Grant,
                OccurredAtUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            });
        });
    }
}
