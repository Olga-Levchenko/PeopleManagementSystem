using AccessControlService.Domain;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// Covers every scenario in spec-1-9's I/O &amp; Edge-Case Matrix for
/// <see cref="ManagerSectionAccessPolicy"/> itself (the endpoint's neither-line-qualifies and
/// invalid-query-param rows belong to <c>AccessRoleResolverCompositionTests</c> instead, since
/// they're HTTP-shaped): Reporting-line-only (unnarrowed), Project-line-only (narrowed), and both
/// lines qualifying (most-permissive-path-wins -- identical to Reporting-line-only).
/// </summary>
public class ManagerSectionAccessPolicyTests
{
    /// <summary>
    /// The unnarrowed result every non-narrowed section must match in every scenario, and the whole
    /// result Reporting-line-only and both-lines-qualify must match exactly, per
    /// <c>docs/access-control/section-matrix.md</c>'s Reporting-line column.
    /// </summary>
    private static readonly ManagerSectionAccess Unnarrowed = new()
    {
        S1 = SectionAccess.ReadWrite,
        S2 = SectionAccess.Read,
        S3 = SectionAccess.Read,
        S4 = SectionAccess.ReadWrite,
        S5 = SectionAccess.Read,
        S6 = SectionAccess.ReadWrite,
        S7 = SectionAccess.ReadWrite,
        S8 = SectionAccess.ReadWrite,
        S9 = SectionAccess.ReadWrite,
        S10 = SectionAccess.Read,
        S11 = SectionAccess.Read,
        S12 = SectionAccess.ReadWrite,
        S13 = SectionAccess.ReadWrite,
        S14 = SectionAccess.ReadWrite,
        S15 = SectionAccess.Read,
        S16 = SectionAccess.ReadWrite,
    };

    [Fact]
    public void Resolve_NeitherLineQualifies_ThrowsArgumentException()
    {
        // Fail closed, not fail open: AccessRole.None (or any {ReportingLine:false,
        // ProjectLine:false}) is out of this method's own documented contract -- it must never
        // silently return the unnarrowed, mostly-ReadWrite result for a viewer with no Manager
        // access at all toward the subject.
        Assert.Throws<ArgumentException>(() => ManagerSectionAccessPolicy.Resolve(AccessRole.None));
    }

    [Fact]
    public void Resolve_ReportingLineOnly_MatchesUnnarrowedReportingLineColumnForAllSixteenSections()
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = true, ProjectLine = false });

        Assert.Equal(Unnarrowed, result);
    }

    [Fact]
    public void Resolve_BothLinesQualify_YieldsTheUnnarrowedReportingLineResultNotTheNarrowedOne()
    {
        // Most-permissive-path-wins: ReportingLine=true always wins, even though ProjectLine is
        // also true here.
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = true, ProjectLine = true });

        Assert.Equal(Unnarrowed, result);
    }

    [Fact]
    public void Resolve_ProjectLineOnly_S2IsNone()
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = false, ProjectLine = true });

        Assert.Equal(SectionAccessLevel.None, result.S2.Level);
        Assert.Null(result.S2.Restriction);
    }

    [Fact]
    public void Resolve_ProjectLineOnly_S3IsNone()
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = false, ProjectLine = true });

        Assert.Equal(SectionAccessLevel.None, result.S3.Level);
        Assert.Null(result.S3.Restriction);
    }

    [Fact]
    public void Resolve_ProjectLineOnly_S5IsReadRestrictedToCvAndCertificatesOnly()
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = false, ProjectLine = true });

        Assert.Equal(SectionAccessLevel.Read, result.S5.Level);
        Assert.Equal("CV and certificates only", result.S5.Restriction);
    }

    [Fact]
    public void Resolve_ProjectLineOnly_EveryOtherSectionIncludingS6MatchesReportingLine()
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = false, ProjectLine = true });

        Assert.Equal(Unnarrowed.S1, result.S1);
        Assert.Equal(Unnarrowed.S4, result.S4);
        Assert.Equal(Unnarrowed.S6, result.S6);
        Assert.Equal(Unnarrowed.S7, result.S7);
        Assert.Equal(Unnarrowed.S8, result.S8);
        Assert.Equal(Unnarrowed.S9, result.S9);
        Assert.Equal(Unnarrowed.S10, result.S10);
        Assert.Equal(Unnarrowed.S11, result.S11);
        Assert.Equal(Unnarrowed.S12, result.S12);
        Assert.Equal(Unnarrowed.S13, result.S13);
        Assert.Equal(Unnarrowed.S14, result.S14);
        Assert.Equal(Unnarrowed.S15, result.S15);
        Assert.Equal(Unnarrowed.S16, result.S16);
    }

    [Theory]
    [InlineData(SectionAccessLevel.ReadWrite, "S1")]
    [InlineData(SectionAccessLevel.Read, "S2")]
    [InlineData(SectionAccessLevel.Read, "S3")]
    [InlineData(SectionAccessLevel.ReadWrite, "S4")]
    [InlineData(SectionAccessLevel.Read, "S5")]
    [InlineData(SectionAccessLevel.ReadWrite, "S6")]
    [InlineData(SectionAccessLevel.ReadWrite, "S7")]
    [InlineData(SectionAccessLevel.ReadWrite, "S8")]
    [InlineData(SectionAccessLevel.ReadWrite, "S9")]
    [InlineData(SectionAccessLevel.Read, "S10")]
    [InlineData(SectionAccessLevel.Read, "S11")]
    [InlineData(SectionAccessLevel.ReadWrite, "S12")]
    [InlineData(SectionAccessLevel.ReadWrite, "S13")]
    [InlineData(SectionAccessLevel.ReadWrite, "S14")]
    [InlineData(SectionAccessLevel.Read, "S15")]
    [InlineData(SectionAccessLevel.ReadWrite, "S16")]
    public void Resolve_ReportingLineOnly_EachSectionMatchesTheDocumentedSectionMatrixLevel(
        SectionAccessLevel expectedLevel,
        string sectionName)
    {
        var result = ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = true, ProjectLine = false });
        var actual = GetSection(result, sectionName);

        Assert.Equal(expectedLevel, actual.Level);
    }

    private static SectionAccess GetSection(ManagerSectionAccess access, string sectionName) => sectionName switch
    {
        "S1" => access.S1,
        "S2" => access.S2,
        "S3" => access.S3,
        "S4" => access.S4,
        "S5" => access.S5,
        "S6" => access.S6,
        "S7" => access.S7,
        "S8" => access.S8,
        "S9" => access.S9,
        "S10" => access.S10,
        "S11" => access.S11,
        "S12" => access.S12,
        "S13" => access.S13,
        "S14" => access.S14,
        "S15" => access.S15,
        "S16" => access.S16,
        _ => throw new ArgumentOutOfRangeException(nameof(sectionName)),
    };

    // -- spec-1-6b: ResolveForPeoplePartner, per docs/access-control/section-matrix.md's PP
    // column. Matches the unnarrowed Reporting-line view for every section except S2/S3/S5, where
    // PP is ReadWrite while even an unnarrowed Reporting-line viewer is only Read -- confirmed
    // against docs/requirements/project-requirements.md's §3.2 matrix, unamended for these three
    // PP cells by Spec_Changelog_v1.2_to_v1.5.md.
    [Theory]
    [InlineData(SectionAccessLevel.ReadWrite, "S1")]
    [InlineData(SectionAccessLevel.ReadWrite, "S2")]
    [InlineData(SectionAccessLevel.ReadWrite, "S3")]
    [InlineData(SectionAccessLevel.ReadWrite, "S4")]
    [InlineData(SectionAccessLevel.ReadWrite, "S5")]
    [InlineData(SectionAccessLevel.ReadWrite, "S6")]
    [InlineData(SectionAccessLevel.ReadWrite, "S7")]
    [InlineData(SectionAccessLevel.ReadWrite, "S8")]
    [InlineData(SectionAccessLevel.ReadWrite, "S9")]
    [InlineData(SectionAccessLevel.Read, "S10")]
    [InlineData(SectionAccessLevel.Read, "S11")]
    [InlineData(SectionAccessLevel.ReadWrite, "S12")]
    [InlineData(SectionAccessLevel.ReadWrite, "S13")]
    [InlineData(SectionAccessLevel.ReadWrite, "S14")]
    [InlineData(SectionAccessLevel.Read, "S15")]
    [InlineData(SectionAccessLevel.ReadWrite, "S16")]
    public void ResolveForPeoplePartner_EachSectionMatchesTheDocumentedPpColumnLevel(
        SectionAccessLevel expectedLevel,
        string sectionName)
    {
        var result = ManagerSectionAccessPolicy.ResolveForPeoplePartner();
        var actual = GetSection(result, sectionName);

        Assert.Equal(expectedLevel, actual.Level);
    }

    [Fact]
    public void ResolveForPeoplePartner_S2S3S5DivergeFromUnnarrowedReportingLine()
    {
        // The exact regression this test guards: PP must not be computed by calling Resolve with
        // a synthetic ReportingLine=true role, which would silently give PP the wrong (Read-only)
        // level for these three sections.
        var result = ManagerSectionAccessPolicy.ResolveForPeoplePartner();

        Assert.Equal(SectionAccessLevel.ReadWrite, result.S2.Level);
        Assert.Equal(SectionAccessLevel.ReadWrite, result.S3.Level);
        Assert.Equal(SectionAccessLevel.ReadWrite, result.S5.Level);
        Assert.NotEqual(Unnarrowed.S2, result.S2);
        Assert.NotEqual(Unnarrowed.S3, result.S3);
        Assert.NotEqual(Unnarrowed.S5, result.S5);
    }
}
