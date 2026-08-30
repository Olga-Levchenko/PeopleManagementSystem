namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// Fixture-only reports-to / department-management data, seeded via EF Core migration
/// (<c>HasData</c>) until this service consumes a real synced relationship projection from
/// People/Organization (AD-1; tracked as deferred work). Exposed as named constants -- rather than
/// left inline in the migration -- so <c>EfRelationshipRepositoryTests</c> asserts against the same
/// values actually shipped in the migration, not a second, hand-copied set that could silently
/// drift from it. All labels are fabricated, non-identifying placeholders -- never real personal
/// data (see <c>.claude/rules/pseudonymized-data-only.md</c>).
/// </summary>
/// <remarks>
/// Shape (3 departments, 4 people):
/// <code>
/// Departments: Headquarters (root)
///                 └─ Engineering (parent: Headquarters)
///                       └─ Platform (parent: Engineering)
///
/// People (reports-to chain, deepest first):
///   Engineer        --reports to--&gt; PlatformLead   --reports to--&gt; Director   --reports to--&gt; Executive
///   Engineer.dept = Platform
///   PlatformLead manages Platform; Director manages Engineering; Executive manages Headquarters
/// </code>
/// This gives a 3-hop reports-to chain and a 3-level department hierarchy (grandparent-and-beyond
/// ancestor), enough for the integration test to prove every one of
/// <see cref="EfRelationshipRepository"/>'s four lookups against real, migrated, seeded data.
/// </remarks>
public static class FixtureSeedData
{
    public static readonly Guid HeadquartersDepartmentId = Guid.Parse("11111111-0000-0000-0000-000000000001");
    public static readonly Guid EngineeringDepartmentId = Guid.Parse("11111111-0000-0000-0000-000000000002");
    public static readonly Guid PlatformDepartmentId = Guid.Parse("11111111-0000-0000-0000-000000000003");

    public static readonly Guid ExecutiveId = Guid.Parse("22222222-0000-0000-0000-000000000001");
    public static readonly Guid DirectorId = Guid.Parse("22222222-0000-0000-0000-000000000002");
    public static readonly Guid PlatformLeadId = Guid.Parse("22222222-0000-0000-0000-000000000003");
    public static readonly Guid EngineerId = Guid.Parse("22222222-0000-0000-0000-000000000004");

    public static IReadOnlyList<Department> Departments { get; } = new[]
    {
        new Department
        {
            Id = HeadquartersDepartmentId,
            Label = "Fixture Dept: Headquarters",
            ParentDepartmentId = null,
        },
        new Department
        {
            Id = EngineeringDepartmentId,
            Label = "Fixture Dept: Engineering",
            ParentDepartmentId = HeadquartersDepartmentId,
        },
        new Department
        {
            Id = PlatformDepartmentId,
            Label = "Fixture Dept: Platform",
            ParentDepartmentId = EngineeringDepartmentId,
        },
    };

    public static IReadOnlyList<Person> People { get; } = new[]
    {
        new Person
        {
            Id = ExecutiveId,
            Label = "Fixture Person: Executive",
            ManagerId = null,
            DepartmentId = HeadquartersDepartmentId,
            ManagesDepartmentId = HeadquartersDepartmentId,
        },
        new Person
        {
            Id = DirectorId,
            Label = "Fixture Person: Director",
            ManagerId = ExecutiveId,
            DepartmentId = EngineeringDepartmentId,
            ManagesDepartmentId = EngineeringDepartmentId,
        },
        new Person
        {
            Id = PlatformLeadId,
            Label = "Fixture Person: Platform Lead",
            ManagerId = DirectorId,
            DepartmentId = PlatformDepartmentId,
            ManagesDepartmentId = PlatformDepartmentId,
        },
        new Person
        {
            Id = EngineerId,
            Label = "Fixture Person: Engineer",
            ManagerId = PlatformLeadId,
            DepartmentId = PlatformDepartmentId,
            ManagesDepartmentId = null,
        },
    };
}
