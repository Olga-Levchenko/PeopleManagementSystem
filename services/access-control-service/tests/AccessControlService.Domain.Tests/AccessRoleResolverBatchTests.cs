using AccessControlService.Domain;
using Microsoft.Extensions.Logging.Abstractions;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// Unit tests for <see cref="AccessRoleResolver.ResolveBatchAsync"/>, covering the I/O &amp;
/// Edge-Case Matrix in spec-o4-90. Uses <see cref="FakeRelationshipRepository"/> to stay
/// database-free; the Infrastructure/composition-root proofs live in
/// <c>EfRelationshipRepositoryTests</c> and <c>AccessRoleResolverCompositionTests</c>.
/// </summary>
public class AccessRoleResolverBatchTests
{
    // -- BATCH_REPORTING_LINE --

    [Fact]
    public async Task ResolveBatchAsync_SubjectInTransitiveReporteeIds_ReportingLineTrue()
    {
        // viewer -> directReport -> deepReport (2-hop chain)
        var viewer = Guid.NewGuid();
        var directReport = Guid.NewGuid();
        var deepReport = Guid.NewGuid();
        var unrelated = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(directReport, viewer)
            .SetManager(deepReport, directReport);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { directReport, deepReport, unrelated });

        Assert.True(results[directReport].ReportingLine);
        Assert.True(results[deepReport].ReportingLine);
        Assert.False(results[unrelated].ReportingLine);
    }

    // -- BATCH_DEPT_MANAGEMENT --

    [Fact]
    public async Task ResolveBatchAsync_SubjectInManagedDepartmentSubtree_ReportingLineTrue()
    {
        // Viewer manages RootDept; SubDept is a child of RootDept; subject is in SubDept.
        var viewer = Guid.NewGuid();
        var rootDept = Guid.NewGuid();
        var subDept = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetViewerManagesDepartment(viewer, rootDept)
            .SetParentDepartment(subDept, rootDept)
            .SetDepartment(subject, subDept);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.True(results[subject].ReportingLine);
    }

    [Fact]
    public async Task ResolveBatchAsync_SubjectInViewerDirectlyManagedDepartment_ReportingLineTrue()
    {
        var viewer = Guid.NewGuid();
        var dept = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetViewerManagesDepartment(viewer, dept)
            .SetDepartment(subject, dept);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.True(results[subject].ReportingLine);
    }

    // -- BATCH_PROJECT_LINE_ONLY --

    [Fact]
    public async Task ResolveBatchAsync_SubjectOnViewerManagedProject_ProjectLineTrue_NoReportingLine()
    {
        // Viewer is DM on projectX; subject is assigned to projectX; no reporting-line between them.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(viewer, project)
            .SetAssignedProjects(subject, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.False(results[subject].ReportingLine);
        Assert.True(results[subject].ProjectLine);

        // Project-line-only narrowing: ManagerSectionAccessPolicy.Resolve should yield narrowed
        // access. Validate this through the resolver result flags directly -- the policy mapping
        // is covered by ManagerSectionAccessPolicyTests; here we just verify the flag.
        Assert.False(results[subject].PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveBatchAsync_ViewerNotDmOrPmOnSubjectsProject_ProjectLineFalse()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var viewerProject = Guid.NewGuid();
        var subjectProject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(viewer, viewerProject)
            .SetAssignedProjects(subject, subjectProject);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.False(results[subject].ProjectLine);
    }

    // -- BATCH_PP_LINE (direct) --

    [Fact]
    public async Task ResolveBatchAsync_ViewerIsSubjectsDirectPp_PeoplePartnerLineTrue()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(subject, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.True(results[subject].PeoplePartnerLine);
        Assert.False(results[subject].ReportingLine);
        Assert.False(results[subject].ProjectLine);
    }

    // -- BATCH_PP_LINE_HR (HR-line via set membership in reporteeIds) --

    [Fact]
    public async Task ResolveBatchAsync_ViewerTransitivelyAboveSubjectsPpInHrChain_PeoplePartnerLineTrue()
    {
        // Subject's PP reports to ppManager, who reports to viewer (HR line).
        // Subject is not in the viewer's own reports-to chain.
        var viewer = Guid.NewGuid();
        var ppManager = Guid.NewGuid();
        var pp = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(subject, pp)
            .SetManager(pp, ppManager)
            .SetManager(ppManager, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.True(results[subject].PeoplePartnerLine);
        Assert.False(results[subject].ReportingLine);
    }

    [Fact]
    public async Task ResolveBatchAsync_ViewerIsDirectlyAbovePpInHrChain_PeoplePartnerLineTrue()
    {
        // viewer -> pp (direct; pp reports to viewer); subject's PP is that pp.
        var viewer = Guid.NewGuid();
        var pp = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(subject, pp)
            .SetManager(pp, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subject });

        Assert.True(results[subject].PeoplePartnerLine);
    }

    // -- EMPTY_SUBJECTS --

    [Fact]
    public async Task ResolveBatchAsync_EmptySubjectList_ReturnsEmptyDictionary()
    {
        var viewer = Guid.NewGuid();
        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, Array.Empty<Guid>());

        Assert.Empty(results);
    }

    // -- VIEWER_NOT_IN_DB --

    [Fact]
    public async Task ResolveBatchAsync_ViewerNotInDb_AllSubjectsResolveToNone()
    {
        // Viewer is unknown -- repository has no data for them, so all relationship sets are empty.
        var viewer = Guid.NewGuid();
        var subjectA = Guid.NewGuid();
        var subjectB = Guid.NewGuid();

        // Subjects ARE in the fake (have dept/pp configured) to isolate the viewer-not-in-DB case.
        var repository = new FakeRelationshipRepository()
            .SetDepartment(subjectA, Guid.NewGuid())
            .SetPeoplePartner(subjectA, Guid.NewGuid())
            .SetDepartment(subjectB, Guid.NewGuid());

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { subjectA, subjectB });

        Assert.False(results[subjectA].ReportingLine);
        Assert.False(results[subjectA].ProjectLine);
        Assert.False(results[subjectA].PeoplePartnerLine);
        Assert.False(results[subjectB].ReportingLine);
        Assert.False(results[subjectB].ProjectLine);
        Assert.False(results[subjectB].PeoplePartnerLine);
    }

    // -- SUBJECT_NOT_IN_DB --

    [Fact]
    public async Task ResolveBatchAsync_SubjectNotInDb_ThatSubjectResolvesToNone()
    {
        // One subject is known (has a reporting relationship), another is unknown. Only the known
        // one should qualify.
        var viewer = Guid.NewGuid();
        var knownSubject = Guid.NewGuid();
        var unknownSubject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(knownSubject, viewer);
        // unknownSubject has no data at all.

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { knownSubject, unknownSubject });

        Assert.True(results[knownSubject].ReportingLine);
        Assert.Equal(AccessRole.None, results[unknownSubject]);
    }

    // -- VIEWER_IN_SUBJECTS --

    [Fact]
    public async Task ResolveBatchAsync_ViewerIdInSubjectList_ThatEntryResolvesToNone()
    {
        var viewer = Guid.NewGuid();
        var otherSubject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(otherSubject, viewer)
            // Even if we set the viewer up as self-manager, self must still fail-closed.
            .SetManager(viewer, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, new[] { viewer, otherSubject });

        Assert.Equal(AccessRole.None, results[viewer]);
        Assert.True(results[otherSubject].ReportingLine);
    }

    // -- Multiple subjects resolved correctly in one batch --

    [Fact]
    public async Task ResolveBatchAsync_MixedSubjectRelationships_EachResolvesIndependently()
    {
        var viewer = Guid.NewGuid();
        var reportingSubject = Guid.NewGuid();
        var projectSubject = Guid.NewGuid();
        var ppSubject = Guid.NewGuid();
        var noneSubject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(reportingSubject, viewer)
            .SetProjectsManagedAsDmOrPm(viewer, project)
            .SetAssignedProjects(projectSubject, project)
            .SetPeoplePartner(ppSubject, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(
            viewer,
            new[] { reportingSubject, projectSubject, ppSubject, noneSubject });

        Assert.True(results[reportingSubject].ReportingLine);
        Assert.False(results[reportingSubject].ProjectLine);

        Assert.False(results[projectSubject].ReportingLine);
        Assert.True(results[projectSubject].ProjectLine);

        Assert.False(results[ppSubject].ReportingLine);
        Assert.False(results[ppSubject].ProjectLine);
        Assert.True(results[ppSubject].PeoplePartnerLine);

        Assert.Equal(AccessRole.None, results[noneSubject]);
    }

    [Fact]
    public async Task ResolveBatchAsync_ResultsDictionaryContainsAllRequestedSubjectIds()
    {
        // Every subject id in the input must appear in the result, even if it resolves to None.
        var viewer = Guid.NewGuid();
        var subjects = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };

        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var results = await resolver.ResolveBatchAsync(viewer, subjects);

        foreach (var id in subjects)
        {
            Assert.True(results.ContainsKey(id), $"Result dictionary must contain entry for subject {id}.");
        }
    }

    [Fact]
    public async Task ResolveBatchAsync_DoesNotCallResolveAsync_RepositoryCallPatternIsSetBased()
    {
        // Verify indirectly: for N subjects, the manager lookup (hop-by-hop) count should NOT scale
        // with N. The batch uses a CTE-backed GetTransitiveReporteeIdsAsync which in the fake is
        // implemented as a single BFS (no per-subject manager hops). Since FakeRelationshipRepository
        // increments ManagerLookupCount per GetManagerIdAsync call, and ResolveBatchAsync calls
        // GetTransitiveReporteeIdsAsync (not GetManagerIdAsync in a per-subject loop), the
        // ManagerLookupCount must stay zero for the batch path.
        var viewer = Guid.NewGuid();
        var subjects = Enumerable.Range(0, 10).Select(_ => Guid.NewGuid()).ToList();
        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        await resolver.ResolveBatchAsync(viewer, subjects);

        // ResolveBatchAsync must never call GetManagerIdAsync (the hop-by-hop single-resolve method).
        Assert.Equal(0, repository.ManagerLookupCount);
    }
}
