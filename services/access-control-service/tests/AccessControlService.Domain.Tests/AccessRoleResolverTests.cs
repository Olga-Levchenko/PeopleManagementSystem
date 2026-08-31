using AccessControlService.Domain;
using Microsoft.Extensions.Logging.Abstractions;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// Covers every scenario in spec-1-1b's I/O &amp; Edge-Case Matrix, plus the review-loopback
/// amendments: self-resolution, a multi-level (grandparent) department-ancestor case, and a
/// cycle-safety assertion that fails immediately rather than via a wall-clock timeout.
/// </summary>
public class AccessRoleResolverTests
{
    [Fact]
    public async Task ResolveAsync_TransitiveReportsToNDeep_ReportingLineQualifies()
    {
        // viewer <- managerOfManager <- directManager <- subject (viewer is 3 hops up).
        var viewer = Guid.NewGuid();
        var directManager = Guid.NewGuid();
        var managerOfManager = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, directManager)
            .SetManager(directManager, managerOfManager)
            .SetManager(managerOfManager, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfSubjectsDirectDepartment_ReportingLineQualifies()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var department = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, department)
            .SetDepartmentManager(department, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfParentDepartment_ReportingLineQualifies()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var parentDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetParentDepartment(subjectDepartment, parentDepartment)
            .SetDepartmentManager(parentDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfGrandparentDepartment_ReportingLineQualifies()
    {
        // subjectDepartment -> parentDepartment -> grandparentDepartment (viewer manages the
        // grandparent, 2 levels up from the subject's own department) -- proves the "any ancestor"
        // claim at more than one level, not just a direct parent.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var parentDepartment = Guid.NewGuid();
        var grandparentDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetParentDepartment(subjectDepartment, parentDepartment)
            .SetParentDepartment(parentDepartment, grandparentDepartment)
            .SetDepartmentManager(grandparentDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfUnrelatedDepartment_ReportingLineDoesNotQualify()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var unrelatedDepartment = Guid.NewGuid();

        // Viewer manages a department the subject has no relation to -- no parent link at all.
        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetDepartmentManager(unrelatedDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_SiblingsSharingTheSameManager_ReportingLineDoesNotQualify()
    {
        // viewer and subject both report to the same manager -- viewer is a peer/sibling of the
        // subject, not an ancestor in the subject's reports-to chain. This is a more realistic
        // near-miss than a fully unrelated department: sharing a manager must not itself confer
        // Reporting-line access.
        var sharedManager = Guid.NewGuid();
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(viewer, sharedManager)
            .SetManager(subject, sharedManager);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfChildDepartment_ReportingLineDoesNotQualify()
    {
        // Reverse of the parent/grandparent cases above: the viewer manages a department one
        // level BELOW the subject's own department (a child), not an ancestor. The walk is only
        // supposed to go up toward ancestors, never down toward children.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var childDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetParentDepartment(childDepartment, subjectDepartment)
            .SetDepartmentManager(childDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerQualifiesViaBothReportsToAndDepartmentManagement_ReportingLineQualifies()
    {
        // The viewer is simultaneously the subject's direct reports-to manager AND separately
        // manages the subject's department -- an artificial but valid combination proving the two
        // checks inside ResolveAsync are independent (neither masks a bug in the other), not that
        // either one alone happens to work.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, viewer)
            .SetDepartment(subject, subjectDepartment)
            .SetDepartmentManager(subjectDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_NoRelationshipPath_ReportingLineDoesNotQualify()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        // Repository knows about neither person -- every lookup returns null.
        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_SameViewerTowardTwoSubjectsInOneBatch_EachResultIndependentlyCorrect()
    {
        var viewer = Guid.NewGuid();
        var qualifyingSubject = Guid.NewGuid();
        var nonQualifyingSubject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(qualifyingSubject, viewer);
            // nonQualifyingSubject has no relationship data at all.

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        // Sequential resolution against the same resolver instance, as its own doc requires --
        // not Task.WhenAll (see the concurrency-safety test below).
        var qualifyingResult = await resolver.ResolveAsync(viewer, qualifyingSubject);
        var nonQualifyingResult = await resolver.ResolveAsync(viewer, nonQualifyingSubject);

        Assert.True(qualifyingResult.ReportingLine);
        Assert.False(nonQualifyingResult.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerEqualsSubject_ReturnsReportingLineFalse()
    {
        // Self is a separate access role the caller must check before consulting this resolver --
        // a person is never their own manager. Deliberate, tested outcome, not an unreviewed edge
        // case: even if the fake repository were wired to claim self-management, self-resolution
        // must short-circuit to false before any lookup happens.
        var personId = Guid.NewGuid();
        var repository = new FakeRelationshipRepository()
            .SetManager(personId, personId)
            .SetDepartmentManager(Guid.NewGuid(), personId);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(personId, personId);

        Assert.False(result.ReportingLine);
        Assert.Equal(0, repository.ManagerLookupCount);
        Assert.Equal(0, repository.DepartmentLookupCount);
    }

    [Fact]
    public async Task ResolveAsync_ViewerEqualsSubjectAndGenuinelyDmOnTheirOwnAssignedProject_ReturnsNone()
    {
        // Proves the self-resolution short-circuit applies to Project-line too, not just an
        // accident of unpopulated project data: the person is genuinely seeded as DM on a project
        // they're also assigned to (so, absent the self-check, the direct DM/PM-vs-assigned-project
        // intersection check would find a real overlap and qualify ProjectLine). The self-check
        // must still win, and must do so without even calling the project-lookup methods.
        var personId = Guid.NewGuid();
        var project = Guid.NewGuid();
        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(personId, project)
            .SetAssignedProjects(personId, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(personId, personId);

        Assert.Equal(AccessRole.None, result);
        Assert.False(result.ReportingLine);
        Assert.False(result.ProjectLine);
        Assert.Equal(0, repository.DmOrPmProjectLookupCount);
        Assert.Equal(0, repository.AssignedProjectLookupCount);
    }

    [Fact]
    public async Task ResolveAsync_CyclicReportsToChain_StopsWithinABoundedNumberOfLookups()
    {
        // A -> B -> C -> A: a cyclic reports-to chain with no path to the viewer at all.
        var viewer = Guid.NewGuid();
        var personA = Guid.NewGuid();
        var personB = Guid.NewGuid();
        var personC = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(personA, personB)
            .SetManager(personB, personC)
            .SetManager(personC, personA);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, personA);

        Assert.False(result.ReportingLine);
        // Direct assertion on a bounded lookup count -- not a wall-clock timeout wrapping the
        // call. The cycle has exactly 3 distinct nodes, so a correct cycle guard calls
        // GetManagerIdAsync at most 3 times before detecting the repeat; a regression that removed
        // the guard would instead hit FakeRelationshipRepository's own runaway cap and throw
        // immediately, failing this test fast rather than hanging for several seconds.
        Assert.True(
            repository.ManagerLookupCount <= 3,
            $"Expected a bounded number of manager lookups for a 3-node cycle, got {repository.ManagerLookupCount}.");
    }

    [Fact]
    public async Task ResolveAsync_CyclicDepartmentParentChain_StopsWithinABoundedNumberOfLookups()
    {
        // deptA -> deptB -> deptC -> deptA: a cyclic department-parent chain, no manager matches
        // the viewer anywhere in it.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var deptA = Guid.NewGuid();
        var deptB = Guid.NewGuid();
        var deptC = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, deptA)
            .SetParentDepartment(deptA, deptB)
            .SetParentDepartment(deptB, deptC)
            .SetParentDepartment(deptC, deptA);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
        Assert.True(
            repository.ParentDepartmentLookupCount <= 3,
            $"Expected a bounded number of parent-department lookups for a 3-node cycle, got {repository.ParentDepartmentLookupCount}.");
    }

    // -- spec-1-1c: Project-line resolution -- I/O & Edge-Case Matrix coverage below. --

    [Fact]
    public async Task ResolveAsync_ProjectLineViaDm_ProjectLineQualifies()
    {
        var dm = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(dm, project)
            .SetAssignedProjects(subject, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(dm, subject);

        Assert.True(result.ProjectLine);
        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ProjectLineViaPm_ProjectLineQualifies()
    {
        var pm = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(pm, project)
            .SetAssignedProjects(subject, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(pm, subject);

        Assert.True(result.ProjectLine);
        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_PmAndDmOnSameProject_BothQualifyViaTwoSeparateResolutions()
    {
        var pm = Guid.NewGuid();
        var dm = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(pm, project)
            .SetProjectsManagedAsDmOrPm(dm, project)
            .SetAssignedProjects(subject, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var pmResult = await resolver.ResolveAsync(pm, subject);
        var dmResult = await resolver.ResolveAsync(dm, subject);

        Assert.True(pmResult.ProjectLine);
        Assert.True(dmResult.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerDmButSubjectNotAssignedToThatProject_ProjectLineDoesNotQualify()
    {
        var dm = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var viewersProject = Guid.NewGuid();
        var subjectsProject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(dm, viewersProject)
            .SetAssignedProjects(subject, subjectsProject);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(dm, subject);

        Assert.False(result.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerBothReportsToManagerAndProjectDm_BothLinesQualifySimultaneously()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, viewer)
            .SetProjectsManagedAsDmOrPm(viewer, project)
            .SetAssignedProjects(subject, project);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
        Assert.True(result.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_NoRelationshipPathIncludingNoProjectOverlap_NeitherLineQualifies()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        // Repository knows about neither person on any relation, including project assignment.
        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
        Assert.False(result.ProjectLine);
    }

    // -- Review-loopback additions: a cycle elsewhere in the graph must not mask a real match, and
    //    the ancestor walk must discriminate by department, not just "someone manages something". --

    [Fact]
    public async Task ResolveAsync_GenuineTransitiveMatchPlusUnrelatedCycleElsewhereInGraph_ReportingLineStillQualifies()
    {
        // The viewer is a genuine 2-hops-up manager of the subject (a real transitive match) --
        // AND, entirely disconnected from that path, a separate 3-node cycle exists elsewhere in
        // the same fake repository's data (personX -> personY -> personZ -> personX, none of whom
        // are the viewer, the subject, or reachable from either). This proves the visited-set cycle
        // guard is scoped to the walk it's protecting and doesn't interact badly with unrelated data
        // that merely happens to also be present in the repository.
        var viewer = Guid.NewGuid();
        var directManager = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var personX = Guid.NewGuid();
        var personY = Guid.NewGuid();
        var personZ = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, directManager)
            .SetManager(directManager, viewer)
            .SetManager(personX, personY)
            .SetManager(personY, personZ)
            .SetManager(personZ, personX);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementOfGrandparentWithDecoyManagerOnIntermediateDepartment_ReportingLineQualifiesViaCorrectViewer()
    {
        // Same shape as the grandparent-ancestor test above, but with a decoy: a different person
        // manages the intermediate (parent) department, not the viewer, and a third, wholly
        // unrelated person is on file but manages nothing in this chain at all. Proves the walk
        // credits the viewer specifically for managing the grandparent department -- a bug that
        // matched on "someone manages some department in the ancestor chain" regardless of who would
        // pass with just the viewer's own true-positive assertion, but would also incorrectly
        // qualify the unrelated bystander, which this test's second assertion catches.
        var viewer = Guid.NewGuid();
        var decoyManager = Guid.NewGuid();
        var unrelatedBystander = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var parentDepartment = Guid.NewGuid();
        var grandparentDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetParentDepartment(subjectDepartment, parentDepartment)
            .SetParentDepartment(parentDepartment, grandparentDepartment)
            .SetDepartmentManager(parentDepartment, decoyManager)
            .SetDepartmentManager(grandparentDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);
        Assert.True(result.ReportingLine);

        // Negative control: someone on file who manages nothing in this chain must not qualify just
        // because other people (the decoy, the viewer) manage departments somewhere in it.
        var bystanderResult = await resolver.ResolveAsync(unrelatedBystander, subject);
        Assert.False(bystanderResult.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ManagesSiblingDepartmentSharingSameParentAsSubjects_ReportingLineDoesNotQualify()
    {
        // Stronger negative than the "fully unrelated department" test above: the viewer manages a
        // sibling department -- a different child of the SAME parent department the subject's own
        // department belongs to -- not an ancestor of the subject's department. Sharing a parent must
        // not itself confer Reporting-line access; the walk only goes up the subject's own chain.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var sharedParentDepartment = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();
        var siblingDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, subjectDepartment)
            .SetParentDepartment(subjectDepartment, sharedParentDepartment)
            .SetParentDepartment(siblingDepartment, sharedParentDepartment)
            .SetDepartmentManager(siblingDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }
}
