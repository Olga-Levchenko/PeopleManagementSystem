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
/// Shape (3 departments, 4 people, plus spec-1-1c's project-line fixture below):
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
/// <see cref="EfRelationshipRepository"/>'s four Reporting-line lookups against real, migrated,
/// seeded data.
/// </remarks>
/// <remarks>
/// Project-line fixture (spec-1-1c), independent of the reports-to/department data above except
/// where noted:
/// <code>
/// Project Phoenix: DeliveryManagerOnly (DM), ProjectManagerOnly (PM), ProjectAssignee (Member)
/// Project Orion:   UnrelatedProjectDm (DM, no overlap with Phoenix's assignee)
///                  PlatformLead (DM) + Engineer (Member) -- reuses the existing reports-to pair
///                  above so Engineer's viewer PlatformLead qualifies for BOTH lines at once.
/// Project Zephyr:  PlatformLead (DM) -- a second project PlatformLead is DM on, with no assignee
///                  of its own, so PlatformLead is genuinely DM on two distinct projects
///                  (Orion and Zephyr) and the DM/PM-lookup aggregation is exercised against real
///                  multi-row data, not a single-element case.
/// </code>
/// This covers, against real seeded data: a DM lookup, a PM lookup, two roles on one project, a
/// project with no assignee overlap, a person who qualifies via both lines simultaneously, and a
/// person who is DM on two separate projects.
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

    // -- spec-1-1c: Project-line fixture people (isolated from the reports-to chain above except
    //    PlatformLead/Engineer, reused deliberately -- see remarks). --
    public static readonly Guid DeliveryManagerOnlyId = Guid.Parse("22222222-0000-0000-0000-000000000005");
    public static readonly Guid ProjectManagerOnlyId = Guid.Parse("22222222-0000-0000-0000-000000000006");
    public static readonly Guid ProjectAssigneeId = Guid.Parse("22222222-0000-0000-0000-000000000007");
    public static readonly Guid UnrelatedProjectDmId = Guid.Parse("22222222-0000-0000-0000-000000000008");

    public static readonly Guid ProjectPhoenixId = Guid.Parse("33333333-0000-0000-0000-000000000001");
    public static readonly Guid ProjectOrionId = Guid.Parse("33333333-0000-0000-0000-000000000002");
    public static readonly Guid ProjectZephyrId = Guid.Parse("33333333-0000-0000-0000-000000000003");

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

        // -- spec-1-1c: Project-line fixture people. No manager/department on file -- isolated
        //    from the reports-to chain above so their Project-line qualification (or lack of it)
        //    isn't accidentally aided by Reporting-line data. --
        new Person
        {
            Id = DeliveryManagerOnlyId,
            Label = "Fixture Person: Delivery Manager (Project Phoenix)",
            ManagerId = null,
            DepartmentId = null,
            ManagesDepartmentId = null,
        },
        new Person
        {
            Id = ProjectManagerOnlyId,
            Label = "Fixture Person: Project Manager (Project Phoenix)",
            ManagerId = null,
            DepartmentId = null,
            ManagesDepartmentId = null,
        },
        new Person
        {
            Id = ProjectAssigneeId,
            Label = "Fixture Person: Project Assignee (Project Phoenix)",
            ManagerId = null,
            DepartmentId = null,
            ManagesDepartmentId = null,
        },
        new Person
        {
            Id = UnrelatedProjectDmId,
            Label = "Fixture Person: Delivery Manager (Project Orion, unrelated to Phoenix)",
            ManagerId = null,
            DepartmentId = null,
            ManagesDepartmentId = null,
        },
    };

    public static IReadOnlyList<ProjectAssignment> ProjectAssignments { get; } = new[]
    {
        // Project Phoenix: a DM, a PM (both qualify independently), and a plain assignee.
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000001"),
            ProjectId = ProjectPhoenixId,
            PersonId = DeliveryManagerOnlyId,
            Role = ProjectAssignmentRole.DeliveryManager,
        },
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000002"),
            ProjectId = ProjectPhoenixId,
            PersonId = ProjectManagerOnlyId,
            Role = ProjectAssignmentRole.ProjectManager,
        },
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000003"),
            ProjectId = ProjectPhoenixId,
            PersonId = ProjectAssigneeId,
            Role = ProjectAssignmentRole.Member,
        },

        // Project Orion: an unrelated DM with no assignee overlap with Phoenix (proves "viewer is
        // DM/PM on a project the subject isn't assigned to" does not qualify), plus PlatformLead as
        // DM with Engineer as the assignee -- reusing the existing reports-to pair so PlatformLead
        // qualifies for both Reporting-line and Project-line toward Engineer simultaneously.
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000004"),
            ProjectId = ProjectOrionId,
            PersonId = UnrelatedProjectDmId,
            Role = ProjectAssignmentRole.DeliveryManager,
        },
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000005"),
            ProjectId = ProjectOrionId,
            PersonId = PlatformLeadId,
            Role = ProjectAssignmentRole.DeliveryManager,
        },
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000006"),
            ProjectId = ProjectOrionId,
            PersonId = EngineerId,
            Role = ProjectAssignmentRole.Member,
        },

        // Project Zephyr: PlatformLead's second DM assignment (no assignee of its own) -- proves
        // GetProjectIdsManagedAsDmOrPmAsync aggregates multiple project ids for one person, rather
        // than only ever exercising a single-element result.
        new ProjectAssignment
        {
            Id = Guid.Parse("44444444-0000-0000-0000-000000000007"),
            ProjectId = ProjectZephyrId,
            PersonId = PlatformLeadId,
            Role = ProjectAssignmentRole.DeliveryManager,
        },
    };
}
