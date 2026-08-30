using AccessControlService.Domain;

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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
        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

        var result = await resolver.ResolveAsync(personId, personId);

        Assert.False(result.ReportingLine);
        Assert.Equal(0, repository.ManagerLookupCount);
        Assert.Equal(0, repository.DepartmentLookupCount);
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

        var resolver = new AccessRoleResolver(repository);

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

        var resolver = new AccessRoleResolver(repository);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
        Assert.True(
            repository.ParentDepartmentLookupCount <= 3,
            $"Expected a bounded number of parent-department lookups for a 3-node cycle, got {repository.ParentDepartmentLookupCount}.");
    }
}
