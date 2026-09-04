using AccessControlService.Domain;
using Microsoft.Extensions.Logging;
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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerQualifiesViaBothReportsToAndDepartmentManagement_ReportingLineQualifies()
    {
        // The viewer is simultaneously the subject's direct reports-to manager AND separately
        // manages the subject's department -- an artificial but valid combination proving the
        // ReportingLine flag is still true when both underlying checks would independently qualify
        // the viewer. Note: ResolveAsync's `||` short-circuits on the first true check (reports-to,
        // evaluated first), so this scenario alone doesn't exercise the department-management
        // branch -- that branch has its own dedicated coverage above
        // (ResolveAsync_DepartmentManagementOfSubjectsDirectDepartment...).
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var subjectDepartment = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, viewer)
            .SetDepartment(subject, subjectDepartment)
            .SetDepartmentManager(subjectDepartment, viewer);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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
        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        // Sequential resolution against the same resolver instance, as its own doc requires -- not
        // Task.WhenAll. This fake completes synchronously (Task.FromResult), so it can't actually
        // demonstrate the documented "concurrent calls are not safe and will throw" contract --
        // that only manifests against a real, non-thread-safe EF Core DbContext. See
        // AccessRoleResolverCompositionTests.RealDiComposedResolver_ConcurrentResolveAsyncCalls_ThrowsInvalidOperationException
        // for that proof.
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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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
        // intersection check would find a real overlap and qualify ProjectLine). The FPA lookup
        // runs before the self-view check (FullProfileAccessLine is viewer-only), but no
        // relationship repository lookups (project, manager, department, PP) must happen.
        var personId = Guid.NewGuid();
        var project = Guid.NewGuid();
        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(personId, project)
            .SetAssignedProjects(personId, project);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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
        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

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

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerIsPlainMemberNotDmOrPmOnSharedProject_ProjectLineDoesNotQualify()
    {
        // Viewer and subject are both assigned to the same project, but the viewer holds no DM/PM
        // role on it -- plain project membership only (SetProjectsManagedAsDmOrPm is never called
        // for the viewer). Proves the DM/PM-only intersection doesn't degrade into "any shared
        // project membership," the most direct way this check could regress.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var sharedProject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetAssignedProjects(viewer, sharedProject)
            .SetAssignedProjects(subject, sharedProject);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_ReportsToChainLongerThanMaxHopsWithNoCycle_TruncatesAndLogsWarning()
    {
        // Builds a genuinely long, acyclic reports-to chain (101 distinct people, 100 manager
        // links) that never reaches the viewer and never runs out of managers within MaxHops (100,
        // AccessRoleResolver's own private constant -- this test is coupled to that value and needs
        // updating if it changes). Every existing "long chain" test in this file uses a short cycle
        // instead, which is caught by the earlier visited.Add guard -- this is the only test
        // exercising the separate "ran out of hops without a cycle" branch and its own LogWarning
        // call, which every other test leaves uncovered by using NullLogger.
        var subject = Guid.NewGuid();
        var viewer = Guid.NewGuid();
        var chain = new Guid[101];
        chain[0] = subject;
        for (var i = 1; i < chain.Length; i++)
        {
            chain[i] = Guid.NewGuid();
        }

        var repository = new FakeRelationshipRepository();
        for (var i = 0; i < chain.Length - 1; i++)
        {
            repository.SetManager(chain[i], chain[i + 1]);
        }

        var logger = new RecordingLogger<AccessRoleResolver>();
        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), logger);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
        Assert.Contains(
            logger.Entries,
            entry => entry.Level == LogLevel.Warning && entry.Message.Contains("Reports-to walk"));
    }

    // -- spec-1-6b: PP/HR-line resolution -- I/O & Edge-Case Matrix coverage below. --

    [Fact]
    public async Task ResolveAsync_ViewerIsSubjectsAssignedPp_PeoplePartnerLineQualifies()
    {
        var pp = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(subject, pp);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(pp, subject);

        Assert.True(result.PeoplePartnerLine);
        Assert.False(result.ReportingLine);
        Assert.False(result.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerIsTransitivelyAboveThePpInThePpsOwnReportsToChain_PeoplePartnerLineQualifies()
    {
        // subject's PP reports to ppManager, who reports to viewer -- the "HR line", the PP's own
        // manager chain, not the subject's.
        var viewer = Guid.NewGuid();
        var ppManager = Guid.NewGuid();
        var pp = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(subject, pp)
            .SetManager(pp, ppManager)
            .SetManager(ppManager, viewer);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_ReportingLineViewerIsolatedFromSubjectsPpsOwnManagerChain_ReportingLineTrueAndPeoplePartnerLineFalse()
    {
        // Viewer is the subject's own reports-to manager -- a genuine Reporting-line qualifier --
        // but has no relation at all to the subject's PP or that PP's own manager chain. The two
        // lines must not leak into each other.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var pp = Guid.NewGuid();
        var ppManager = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, viewer)
            .SetPeoplePartner(subject, pp)
            .SetManager(pp, ppManager);
            // ppManager has no manager set -- viewer is never reachable from pp's own chain.

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
        Assert.False(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_SubjectHasNoAssignedPp_PeoplePartnerLineDoesNotQualifyAndDoesNotThrow()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        // No SetPeoplePartner call at all -- subject.peoplePartnerId is null on file.
        var repository = new FakeRelationshipRepository();
        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerEqualsSubject_PeoplePartnerLineFalseHandledByExistingEarlyReturn()
    {
        // The FPA repository is looked up before the self-view check (FullProfileAccessLine is
        // viewer-only, not viewer-to-subject), but the relationship repository must not be called
        // at all -- the self-view guard returns before any relationship lookups happen.
        var personId = Guid.NewGuid();
        var repository = new FakeRelationshipRepository()
            .SetPeoplePartner(personId, personId);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(personId, personId);

        Assert.Equal(AccessRole.None, result);
        Assert.False(result.PeoplePartnerLine);
        Assert.Equal(0, repository.PeoplePartnerLookupCount);
    }

    [Fact]
    public async Task ResolveAsync_ProjectLineViewerUnrelatedToSubjectsPp_ProjectLineTrueAndPeoplePartnerLineFalse()
    {
        // Independent-lines proof from the other direction: a Project-line-only viewer, with no
        // relation to the subject's PP chain at all.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();
        var pp = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetProjectsManagedAsDmOrPm(viewer, project)
            .SetAssignedProjects(subject, project)
            .SetPeoplePartner(subject, pp);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ProjectLine);
        Assert.False(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_AllThreeLinesQualifySimultaneously_AllThreeFlagsTrue()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();
        var project = Guid.NewGuid();

        var repository = new FakeRelationshipRepository()
            .SetManager(subject, viewer)
            .SetProjectsManagedAsDmOrPm(viewer, project)
            .SetAssignedProjects(subject, project)
            .SetPeoplePartner(subject, viewer);

        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.ReportingLine);
        Assert.True(result.ProjectLine);
        Assert.True(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentAncestorChainLongerThanMaxHopsWithNoCycle_TruncatesAndLogsWarning()
    {
        // Department-ancestor analogue of the reports-to test above: 101 distinct departments (100
        // parent links), none managed by the viewer, exceeding MaxHops without ever reaching a root
        // department (ParentDepartmentId null) or a cycle.
        var subject = Guid.NewGuid();
        var viewer = Guid.NewGuid();
        var departments = new Guid[101];
        for (var i = 0; i < departments.Length; i++)
        {
            departments[i] = Guid.NewGuid();
        }

        var repository = new FakeRelationshipRepository()
            .SetDepartment(subject, departments[0]);
        for (var i = 0; i < departments.Length - 1; i++)
        {
            repository.SetParentDepartment(departments[i], departments[i + 1]);
        }

        var logger = new RecordingLogger<AccessRoleResolver>();
        var resolver = new AccessRoleResolver(repository, new FakeFullProfileAccessRepository(), logger);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.ReportingLine);
        Assert.Contains(
            logger.Entries,
            entry => entry.Level == LogLevel.Warning && entry.Message.Contains("Department-ancestor walk"));
    }

    // -- spec-1-5: FullProfileAccessLine -- I/O & Edge-Case Matrix coverage below. --

    [Fact]
    public async Task ResolveAsync_ViewerIsHolder_FullProfileAccessLineTrue()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var fpaRepository = new FakeFullProfileAccessRepository().AddHolder(viewer);
        var resolver = new AccessRoleResolver(
            new FakeRelationshipRepository(),
            fpaRepository,
            NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.FullProfileAccessLine);
    }

    [Fact]
    public async Task ResolveAsync_ViewerIsNotHolder_FullProfileAccessLineFalse()
    {
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var resolver = new AccessRoleResolver(
            new FakeRelationshipRepository(),
            new FakeFullProfileAccessRepository(), // no holders seeded
            NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.False(result.FullProfileAccessLine);
    }

    [Fact]
    public async Task ResolveAsync_HolderViewingOwnProfile_FullProfileAccessLineTrueAndRelationshipFlagsFalse()
    {
        // FullProfileAccessLine is viewer-only (spec §2.4): it is resolved before the self-view
        // guard and is preserved even when viewerId == subjectId. All relationship-derived flags
        // (ReportingLine, ProjectLine, PeoplePartnerLine) must be false for self-view.
        var viewer = Guid.NewGuid();

        var fpaRepository = new FakeFullProfileAccessRepository().AddHolder(viewer);
        var resolver = new AccessRoleResolver(
            new FakeRelationshipRepository(),
            fpaRepository,
            NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, viewer);

        Assert.True(result.FullProfileAccessLine);
        Assert.False(result.ReportingLine);
        Assert.False(result.ProjectLine);
        Assert.False(result.PeoplePartnerLine);
    }

    [Fact]
    public async Task ResolveAsync_HolderWithNoRelationships_FullProfileAccessLineTrueAndOtherFlagsFalse()
    {
        // Isolation: FullProfileAccessLine must be independent of the three relationship-derived
        // lines -- a holder with no reporting/project/PP relationship still gets FullProfileAccessLine=true.
        var viewer = Guid.NewGuid();
        var subject = Guid.NewGuid();

        var fpaRepository = new FakeFullProfileAccessRepository().AddHolder(viewer);
        var resolver = new AccessRoleResolver(
            new FakeRelationshipRepository(), // no relationships configured
            fpaRepository,
            NullLogger<AccessRoleResolver>.Instance);

        var result = await resolver.ResolveAsync(viewer, subject);

        Assert.True(result.FullProfileAccessLine);
        Assert.False(result.ReportingLine);
        Assert.False(result.ProjectLine);
        Assert.False(result.PeoplePartnerLine);
    }
}
