using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Persistence;

/// <summary>
/// Proves <see cref="EfRelationshipRepository"/> -- the only production implementation of
/// <see cref="AccessControlService.Domain.IRelationshipRepository"/> -- against a real, ephemeral
/// Postgres instance with the actual EF Core migration applied, not a fake/in-memory provider.
/// This is the test the spec's review loopback added: <c>AccessRoleResolverTests</c> only ever
/// exercises a hand-written fake, so it cannot catch a bug in the real EF Core query translation
/// (a swapped column, a wrong table, a mapping error). This class is the only thing that actually
/// proves "the seed data is present and queryable" -- previously verified solely by a manual
/// <c>psql</c> check, which <c>dotnet test</c> never ran.
/// </summary>
public sealed class EfRelationshipRepositoryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private AccessControlDbContext _dbContext = null!;
    private EfRelationshipRepository _repository = null!;

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresContainer.GetConnectionString())
            .Options;

        _dbContext = new AccessControlDbContext(options);

        // Applies the actual, committed EF Core migration (schema + FixtureSeedData HasData seed)
        // against this real, ephemeral instance -- exactly what a real deployment runs, not a
        // hand-rolled schema-creation shortcut like EnsureCreated().
        await _dbContext.Database.MigrateAsync();

        _repository = new EfRelationshipRepository(_dbContext, NullLogger<EfRelationshipRepository>.Instance);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task GetManagerIdAsync_KnownPersonWithManager_ReturnsSeededManagerId()
    {
        var managerId = await _repository.GetManagerIdAsync(FixtureSeedData.EngineerId);

        Assert.Equal(FixtureSeedData.PlatformLeadId, managerId);
    }

    [Fact]
    public async Task GetManagerIdAsync_SeededPersonWithNoManager_ReturnsNull()
    {
        var managerId = await _repository.GetManagerIdAsync(FixtureSeedData.ExecutiveId);

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetManagerIdAsync_UnknownPersonId_ReturnsNull()
    {
        // An id that matches no seeded row currently resolves the same as a known person with no
        // manager -- documented, tracked ambiguity (see this service's CLAUDE.md Gotchas), not a
        // crash. This test pins that current behavior so a future change to it is deliberate.
        var managerId = await _repository.GetManagerIdAsync(Guid.NewGuid());

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetPeoplePartnerIdAsync_KnownPersonWithAssignedPp_ReturnsSeededPeoplePartnerId()
    {
        // spec-1-6b: Engineer's assigned PP is HrPartnerId, per FixtureSeedData's own doc comment.
        var peoplePartnerId = await _repository.GetPeoplePartnerIdAsync(FixtureSeedData.EngineerId);

        Assert.Equal(FixtureSeedData.HrPartnerId, peoplePartnerId);
    }

    [Fact]
    public async Task GetPeoplePartnerIdAsync_KnownPersonWithGenuinelyNoPp_ReturnsNull()
    {
        var peoplePartnerId = await _repository.GetPeoplePartnerIdAsync(FixtureSeedData.ExecutiveId);

        Assert.Null(peoplePartnerId);
    }

    [Fact]
    public async Task GetPeoplePartnerIdAsync_UnknownPersonId_ReturnsNull()
    {
        // Same documented, tracked ambiguity as GetManagerIdAsync_UnknownPersonId_ReturnsNull above
        // -- not a crash.
        var peoplePartnerId = await _repository.GetPeoplePartnerIdAsync(Guid.NewGuid());

        Assert.Null(peoplePartnerId);
    }

    [Fact]
    public async Task GetDepartmentIdAsync_KnownPerson_ReturnsSeededDepartmentId()
    {
        var departmentId = await _repository.GetDepartmentIdAsync(FixtureSeedData.EngineerId);

        Assert.Equal(FixtureSeedData.PlatformDepartmentId, departmentId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_DepartmentWithManager_ReturnsSeededManagerId()
    {
        var managerId = await _repository.GetDepartmentManagerIdAsync(FixtureSeedData.PlatformDepartmentId);

        Assert.Equal(FixtureSeedData.PlatformLeadId, managerId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_UnknownDepartmentId_ReturnsNull()
    {
        var managerId = await _repository.GetDepartmentManagerIdAsync(Guid.NewGuid());

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_ChildDepartment_ReturnsSeededParentId()
    {
        var parentId = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.PlatformDepartmentId);

        Assert.Equal(FixtureSeedData.EngineeringDepartmentId, parentId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_RootDepartment_ReturnsNull()
    {
        var parentId = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.HeadquartersDepartmentId);

        Assert.Null(parentId);
    }

    [Fact]
    public async Task GetParentDepartmentIdAsync_GrandchildDepartment_WalkedTwoHopsUp_ReachesRoot()
    {
        // Proves the full 3-level fixture hierarchy is actually persisted and queryable, not just
        // the first parent hop: Platform -> Engineering -> Headquarters (root).
        var parentOfPlatform = await _repository.GetParentDepartmentIdAsync(FixtureSeedData.PlatformDepartmentId);
        Assert.Equal(FixtureSeedData.EngineeringDepartmentId, parentOfPlatform);

        var parentOfEngineering = await _repository.GetParentDepartmentIdAsync(parentOfPlatform!.Value);
        Assert.Equal(FixtureSeedData.HeadquartersDepartmentId, parentOfEngineering);

        var parentOfHeadquarters = await _repository.GetParentDepartmentIdAsync(parentOfEngineering!.Value);
        Assert.Null(parentOfHeadquarters);
    }

    // -- spec-1-1c: Project-line lookups, against the real, migrated, seeded project-assignment data. --

    [Fact]
    public async Task GetProjectIdsManagedAsDmOrPmAsync_KnownDm_ReturnsSeededProjectId()
    {
        var projectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(FixtureSeedData.DeliveryManagerOnlyId);

        Assert.Equal(new[] { FixtureSeedData.ProjectPhoenixId }, projectIds);
    }

    [Fact]
    public async Task GetProjectIdsManagedAsDmOrPmAsync_KnownPm_ReturnsSeededProjectId()
    {
        var projectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(FixtureSeedData.ProjectManagerOnlyId);

        Assert.Equal(new[] { FixtureSeedData.ProjectPhoenixId }, projectIds);
    }

    [Fact]
    public async Task GetProjectIdsManagedAsDmOrPmAsync_PersonWhoIsDmOnTwoProjects_ReturnsBothSeededProjectIds()
    {
        // PlatformLead is seeded as DM on both Project Orion and Project Zephyr -- proves the
        // query actually aggregates multiple project ids for one person, not just that it returns
        // a single seeded row. Sort before comparing since the method makes no ordering guarantee.
        var projectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(FixtureSeedData.PlatformLeadId);

        Assert.Equal(
            new[] { FixtureSeedData.ProjectOrionId, FixtureSeedData.ProjectZephyrId }.OrderBy(id => id),
            projectIds.OrderBy(id => id));
    }

    [Fact]
    public async Task GetProjectIdsManagedAsDmOrPmAsync_PlainMemberNotDmOrPm_ReturnsEmpty()
    {
        // ProjectAssignee is seeded as a plain Member on Project Phoenix -- must not be returned by
        // the DM/PM-only lookup.
        var projectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(FixtureSeedData.ProjectAssigneeId);

        Assert.Empty(projectIds);
    }

    [Fact]
    public async Task GetProjectIdsManagedAsDmOrPmAsync_UnknownPersonId_ReturnsEmpty()
    {
        var projectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(Guid.NewGuid());

        Assert.Empty(projectIds);
    }

    [Fact]
    public async Task GetAssignedProjectIdsAsync_KnownAssignee_ReturnsSeededProjectId()
    {
        var projectIds = await _repository.GetAssignedProjectIdsAsync(FixtureSeedData.ProjectAssigneeId);

        Assert.Equal(new[] { FixtureSeedData.ProjectPhoenixId }, projectIds);
    }

    [Fact]
    public async Task GetAssignedProjectIdsAsync_PersonWithNoProjectAssignment_ReturnsEmpty()
    {
        // Executive has reports-to/department fixture data but no project-assignment row at all.
        var projectIds = await _repository.GetAssignedProjectIdsAsync(FixtureSeedData.ExecutiveId);

        Assert.Empty(projectIds);
    }

    [Fact]
    public async Task GetAssignedProjectIdsAsync_UnknownPersonId_ReturnsEmpty()
    {
        var projectIds = await _repository.GetAssignedProjectIdsAsync(Guid.NewGuid());

        Assert.Empty(projectIds);
    }

    [Fact]
    public async Task AddProjectAssignment_DuplicateProjectAndPersonPair_SaveChangesThrowsOnUniqueConstraintViolation()
    {
        // ProjectAssignment.cs's and AccessControlDbContext.cs's doc comments claim a duplicate
        // (ProjectId, PersonId) row is "a write-time error, not a silent ambiguity", enforced via a
        // unique index -- nothing previously proved that by actually attempting the write. Use a
        // project id not touched by any seeded row, so this only exercises the constraint this
        // test itself sets up.
        var projectId = Guid.NewGuid();

        _dbContext.ProjectAssignments.Add(new ProjectAssignment
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            PersonId = FixtureSeedData.ExecutiveId,
            Role = ProjectAssignmentRole.Member,
        });
        await _dbContext.SaveChangesAsync();

        _dbContext.ProjectAssignments.Add(new ProjectAssignment
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            PersonId = FixtureSeedData.ExecutiveId,
            Role = ProjectAssignmentRole.DeliveryManager,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _dbContext.SaveChangesAsync());
    }

    [Fact]
    public async Task GetDepartmentIdAsync_KnownPersonWithGenuinelyNullDepartment_ReturnsNull()
    {
        // DeliveryManagerOnlyId is a real, seeded, known person row -- but its DepartmentId column
        // is genuinely null on file (it's a project-line-only fixture person, isolated from the
        // reports-to/department fixture data by design -- see FixtureSeedData's remarks). Proves the
        // real EF Core translation of a genuinely-null FK for a known row, as opposed to
        // GetManagerIdAsync_UnknownPersonId_ReturnsNull above, which only proves the unknown-id case
        // -- until now, the "known row, genuinely null FK" case for department was only ever
        // exercised via the hand-written fake in AccessRoleResolverTests, never against real Postgres.
        var departmentId = await _repository.GetDepartmentIdAsync(FixtureSeedData.DeliveryManagerOnlyId);

        Assert.Null(departmentId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_KnownDepartmentWithGenuinelyNoManager_ReturnsNull()
    {
        // Every seeded department (Headquarters/Engineering/Platform) already has a manager on file,
        // so this scenario -- a real, known department row that genuinely has no Person managing it
        // -- can't be exercised via existing fixture data alone. Insert one directly (no migration
        // change, just a normal row in this test's own ephemeral container) rather than extending
        // the committed FixtureSeedData/migration, keeping this test self-contained.
        var unmanagedDepartmentId = Guid.NewGuid();
        _dbContext.Departments.Add(new Department
        {
            Id = unmanagedDepartmentId,
            Label = "Fixture Dept: genuinely unmanaged (test-local)",
            ParentDepartmentId = null,
        });
        await _dbContext.SaveChangesAsync();

        var managerId = await _repository.GetDepartmentManagerIdAsync(unmanagedDepartmentId);

        Assert.Null(managerId);
    }

    [Fact]
    public async Task GetDepartmentManagerIdAsync_TwoPeopleSharingSameManagesDepartmentId_ReturnsLowerIdDeterministically()
    {
        // GetDepartmentManagerIdAsync's .OrderBy(p => p.Id) tie-break exists purely as a defensive
        // fallback for the hypothetical case where the unique index on Person.ManagesDepartmentId
        // (AccessControlDbContext.cs) is ever bypassed -- nothing previously proved it actually
        // behaves as documented. That index is a real, migrated Postgres constraint (see
        // AddProjectAssignment_DuplicateProjectAndPersonPair_... above for the analogous "the
        // constraint IS enforced" proof on a different table), so a normal EF Core
        // Add/SaveChangesAsync can't violate it here either -- the constraint itself has to be
        // dropped first. This test's own Postgres container is freshly started and torn down for
        // this test method alone (a new instance per test method -- see this class's own
        // InitializeAsync/DisposeAsync, which xUnit invokes per test since this class isn't used via
        // IClassFixture), so dropping the index here cannot affect any other test.
        await _dbContext.Database.ExecuteSqlRawAsync(
            "DROP INDEX \"IX_people_ManagesDepartmentId\"");

        var departmentId = Guid.NewGuid();
        var lowerId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var higherId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");

        // ManagesDepartmentId has its own FK to Departments (independent of the unique index just
        // dropped above) -- a department row has to exist here or the insert below fails on that FK
        // instead of exercising the tie-break this test is actually about.
        _dbContext.Departments.Add(new Department
        {
            Id = departmentId,
            Label = "Fixture Dept: tie-break target (test-local)",
            ParentDepartmentId = null,
        });

        _dbContext.People.AddRange(
            new Person
            {
                Id = higherId,
                Label = "Fixture Person: tie-break higher id (test-local)",
                ManagerId = null,
                DepartmentId = null,
                ManagesDepartmentId = departmentId,
            },
            new Person
            {
                Id = lowerId,
                Label = "Fixture Person: tie-break lower id (test-local)",
                ManagerId = null,
                DepartmentId = null,
                ManagesDepartmentId = departmentId,
            });
        await _dbContext.SaveChangesAsync();

        var managerId = await _repository.GetDepartmentManagerIdAsync(departmentId);

        Assert.Equal(lowerId, managerId);
    }

    [Fact]
    public async Task AddPerson_DuplicateManagesDepartmentId_SaveChangesThrowsOnUniqueConstraintViolation()
    {
        // Proves the "one manager per department" unique index (AccessControlDbContext.cs,
        // person.HasIndex(p => p.ManagesDepartmentId).IsUnique()) actually rejects a duplicate write
        // through the normal EF Core Add/SaveChangesAsync path -- nothing previously attempted this
        // write; only the read path against pre-seeded, already-valid fixture data was tested.
        // PlatformDepartmentId already has a seeded manager (PlatformLead) -- attempt a second one.
        _dbContext.People.Add(new Person
        {
            Id = Guid.NewGuid(),
            Label = "Fixture Person: second Platform manager, should be rejected (test-local)",
            ManagerId = null,
            DepartmentId = null,
            ManagesDepartmentId = FixtureSeedData.PlatformDepartmentId,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _dbContext.SaveChangesAsync());
    }

    // -- O4-90: batch resolution method tests against real Postgres. --

    [Fact]
    public async Task GetTransitiveReporteeIdsAsync_KnownManager_ReturnsAllTransitiveReportees()
    {
        // The fixture chain is: Engineer -> PlatformLead -> Director -> Executive.
        // Executive's transitive reportees are Director, PlatformLead, and Engineer (3 total).
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(FixtureSeedData.ExecutiveId);

        Assert.Contains(FixtureSeedData.DirectorId, reporteeIds);
        Assert.Contains(FixtureSeedData.PlatformLeadId, reporteeIds);
        Assert.Contains(FixtureSeedData.EngineerId, reporteeIds);
        // Executive himself is not his own reportee.
        Assert.DoesNotContain(FixtureSeedData.ExecutiveId, reporteeIds);
    }

    [Fact]
    public async Task GetTransitiveReporteeIdsAsync_DirectManagerOnly_ReturnsDirectReporteeButNotGrandchild()
    {
        // PlatformLead's transitive reportees include Engineer (direct) only within the main chain,
        // but also Engineer (direct). Director is PlatformLead's manager, not a reportee.
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(FixtureSeedData.PlatformLeadId);

        Assert.Contains(FixtureSeedData.EngineerId, reporteeIds);
        Assert.DoesNotContain(FixtureSeedData.PlatformLeadId, reporteeIds);
        Assert.DoesNotContain(FixtureSeedData.DirectorId, reporteeIds);
    }

    [Fact]
    public async Task GetTransitiveReporteeIdsAsync_PersonWithNoDirectReports_ReturnsEmpty()
    {
        // Engineer has no one reporting to them.
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(FixtureSeedData.EngineerId);

        Assert.Empty(reporteeIds);
    }

    [Fact]
    public async Task GetTransitiveReporteeIdsAsync_UnknownViewerId_ReturnsEmpty()
    {
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(Guid.NewGuid());

        Assert.Empty(reporteeIds);
    }

    [Fact]
    public async Task GetTransitiveReporteeIdsAsync_HrChain_ReturnsHrPartnerForHrDirector()
    {
        // HrPartner reports to HrDirector (spec-1-6b HR-line fixture) -- proves the CTE works on
        // a chain outside the main Engineering hierarchy.
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(FixtureSeedData.HrDirectorId);

        Assert.Contains(FixtureSeedData.HrPartnerId, reporteeIds);
    }

    [Fact]
    public async Task GetManagedDepartmentSubtreeIdsAsync_ViewerManagesRootDept_ReturnsFullSubtree()
    {
        // Executive manages Headquarters; subtree = Headquarters + Engineering + Platform.
        var subtreeIds = await _repository.GetManagedDepartmentSubtreeIdsAsync(FixtureSeedData.ExecutiveId);

        Assert.Contains(FixtureSeedData.HeadquartersDepartmentId, subtreeIds);
        Assert.Contains(FixtureSeedData.EngineeringDepartmentId, subtreeIds);
        Assert.Contains(FixtureSeedData.PlatformDepartmentId, subtreeIds);
    }

    [Fact]
    public async Task GetManagedDepartmentSubtreeIdsAsync_ViewerManagesLeafDept_ReturnsOnlyThatDept()
    {
        // PlatformLead manages Platform (a leaf with no children in the fixture).
        var subtreeIds = await _repository.GetManagedDepartmentSubtreeIdsAsync(FixtureSeedData.PlatformLeadId);

        Assert.Contains(FixtureSeedData.PlatformDepartmentId, subtreeIds);
        Assert.DoesNotContain(FixtureSeedData.EngineeringDepartmentId, subtreeIds);
        Assert.DoesNotContain(FixtureSeedData.HeadquartersDepartmentId, subtreeIds);
    }

    [Fact]
    public async Task GetManagedDepartmentSubtreeIdsAsync_ViewerManagesNoDepartment_ReturnsEmpty()
    {
        // Engineer manages no department -- ManagesDepartmentId is null on file.
        var subtreeIds = await _repository.GetManagedDepartmentSubtreeIdsAsync(FixtureSeedData.EngineerId);

        Assert.Empty(subtreeIds);
    }

    [Fact]
    public async Task GetManagedDepartmentSubtreeIdsAsync_UnknownViewerId_ReturnsEmpty()
    {
        var subtreeIds = await _repository.GetManagedDepartmentSubtreeIdsAsync(Guid.NewGuid());

        Assert.Empty(subtreeIds);
    }

    [Fact]
    public async Task GetSubjectAttributesBatchAsync_KnownSubjects_ReturnsDepartmentAndPeoplePartnerId()
    {
        // Engineer has DepartmentId = PlatformDepartmentId and PeoplePartnerId = HrPartnerId.
        var attrs = await _repository.GetSubjectAttributesBatchAsync(
            new[] { FixtureSeedData.EngineerId, FixtureSeedData.DirectorId });

        Assert.True(attrs.ContainsKey(FixtureSeedData.EngineerId));
        Assert.Equal(FixtureSeedData.PlatformDepartmentId, attrs[FixtureSeedData.EngineerId].DepartmentId);
        Assert.Equal(FixtureSeedData.HrPartnerId, attrs[FixtureSeedData.EngineerId].PeoplePartnerId);

        // Director has a department but no PP on file.
        Assert.True(attrs.ContainsKey(FixtureSeedData.DirectorId));
        Assert.Equal(FixtureSeedData.EngineeringDepartmentId, attrs[FixtureSeedData.DirectorId].DepartmentId);
        Assert.Null(attrs[FixtureSeedData.DirectorId].PeoplePartnerId);
    }

    [Fact]
    public async Task GetSubjectAttributesBatchAsync_UnknownSubjectId_OmittedFromResult()
    {
        var unknownId = Guid.NewGuid();
        var attrs = await _repository.GetSubjectAttributesBatchAsync(new[] { unknownId });

        Assert.DoesNotContain(unknownId, attrs.Keys);
    }

    [Fact]
    public async Task GetSubjectAttributesBatchAsync_EmptyInput_ReturnsEmptyDictionary()
    {
        var attrs = await _repository.GetSubjectAttributesBatchAsync(Array.Empty<Guid>());

        Assert.Empty(attrs);
    }

    [Fact]
    public async Task GetSubjectsOnViewerProjectsAsync_SubjectOnViewerProject_ReturnsThatSubject()
    {
        // DeliveryManagerOnly is DM on Phoenix; ProjectAssignee is Member on Phoenix.
        var result = await _repository.GetSubjectsOnViewerProjectsAsync(
            new[] { FixtureSeedData.ProjectPhoenixId },
            new[] { FixtureSeedData.ProjectAssigneeId, FixtureSeedData.EngineerId });

        Assert.Contains(FixtureSeedData.ProjectAssigneeId, result);
        // Engineer is not assigned to Phoenix (only to Orion via fixture).
        Assert.DoesNotContain(FixtureSeedData.EngineerId, result);
    }

    [Fact]
    public async Task GetSubjectsOnViewerProjectsAsync_SubjectNotOnViewerProject_ReturnsEmpty()
    {
        // Orion project; ProjectAssignee is only on Phoenix, not Orion.
        var result = await _repository.GetSubjectsOnViewerProjectsAsync(
            new[] { FixtureSeedData.ProjectOrionId },
            new[] { FixtureSeedData.ProjectAssigneeId });

        Assert.Empty(result);
    }

    [Fact]
    public async Task GetSubjectsOnViewerProjectsAsync_EmptyViewerProjects_ReturnsEmpty()
    {
        var result = await _repository.GetSubjectsOnViewerProjectsAsync(
            Array.Empty<Guid>(),
            new[] { FixtureSeedData.ProjectAssigneeId });

        Assert.Empty(result);
    }

    [Fact]
    public async Task GetSubjectsOnViewerProjectsAsync_EmptySubjectIds_ReturnsEmpty()
    {
        var result = await _repository.GetSubjectsOnViewerProjectsAsync(
            new[] { FixtureSeedData.ProjectPhoenixId },
            Array.Empty<Guid>());

        Assert.Empty(result);
    }
}
