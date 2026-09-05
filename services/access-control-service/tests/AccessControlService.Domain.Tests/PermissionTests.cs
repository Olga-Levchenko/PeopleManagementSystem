using AccessControlService.Domain.Permissions;

namespace AccessControlService.Domain.Tests;

public sealed class PermissionTests
{
    [Fact]
    public void Catalogue_ContainsAllApprovedPermissionKeys()
    {
        Assert.Equal(18, PermissionCatalogue.Definitions.Count);
        Assert.Contains(
            PermissionCatalogue.Definitions,
            definition => definition.Key == PermissionCatalogue.VIEW_DASHBOARD &&
                          definition.RequiresDashboardScope);
        Assert.DoesNotContain(
            PermissionCatalogue.Definitions,
            definition => definition.Key == PermissionCatalogue.RECORD_DEPARTURE &&
                          definition.RequiresDashboardScope);
    }

    [Fact]
    public void ScopeValidator_NormalizesDashboardScope()
    {
        string? normalized = PermissionScopeValidator.ValidateAndNormalize(
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"delivery-manager"}""");

        Assert.Equal("""{"dashboardType":"delivery-manager"}""", normalized);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("""{}""")]
    [InlineData("""{"dashboardType":"unknown"}""")]
    [InlineData("""{"dashboardType":"unit-manager","extra":"value"}""")]
    public void ScopeValidator_RejectsInvalidDashboardScope(string? scope)
    {
        Assert.Throws<ArgumentException>(() =>
            PermissionScopeValidator.ValidateAndNormalize(PermissionCatalogue.VIEW_DASHBOARD, scope));
    }

    [Fact]
    public void ScopeValidator_RejectsScopeForUnscopedPermission()
    {
        Assert.Throws<ArgumentException>(() =>
            PermissionScopeValidator.ValidateAndNormalize(
                PermissionCatalogue.CREATE_ACTION_ITEMS,
                """{"dashboardType":"unit-manager"}"""));
    }

    [Fact]
    public void Evaluator_MatchesStoredPermissionAndExactScope()
    {
        var grants = new[]
        {
            new PermissionGrantValue(
                PermissionCatalogue.VIEW_DASHBOARD,
                """{"dashboardType":"unit-manager"}"""),
        };

        Assert.True(PermissionEvaluator.IsGranted(
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"unit-manager"}""",
            grants));
        Assert.False(PermissionEvaluator.IsGranted(
            PermissionCatalogue.VIEW_DASHBOARD,
            """{"dashboardType":"project-manager"}""",
            grants));
    }
}
