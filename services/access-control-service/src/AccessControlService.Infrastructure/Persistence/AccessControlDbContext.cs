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
                DepartmentId = p.DepartmentId,
                ManagesDepartmentId = p.ManagesDepartmentId,
            }));
        });
    }
}
