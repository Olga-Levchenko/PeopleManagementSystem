namespace AccessControlService.Domain.Permissions;

public static class PermissionCatalogue
{
    public const string CREATE_FORM_CAMPAIGNS = "create-form-campaigns";
    public const string CREATE_ACTION_ITEMS = "create-action-items";
    public const string CREATE_EDIT_RISKS = "create-edit-risks";
    public const string CREATE_RESOURCING_REQUESTS = "create-resourcing-requests";
    public const string FULFIL_RESOURCING_REQUESTS = "fulfil-resourcing-requests";
    public const string APPROVE_REJECT_RESOURCING_CANDIDATES = "approve-reject-resourcing-candidates";
    public const string CLOSE_RESOURCING_REQUESTS = "close-resourcing-requests";
    public const string ASSIGN_MENTORS = "assign-mentors";
    public const string MAINTAIN_CDS_RECORDS = "maintain-cds-records";
    public const string EDIT_CAREER_TIMELINE = "edit-career-timeline";
    public const string CREATE_FEEDBACK = "create-feedback";
    public const string RECORD_DEPARTURE = "record-departure";
    public const string MANAGE_DEPARTMENTS = "manage-departments";
    public const string MANAGE_CUSTOM_FIELDS = "manage-custom-fields";
    public const string CHANGE_ORGANISATIONAL_RELATIONSHIPS = "change-organisational-relationships";
    public const string MANAGE_SYSTEM_DICTIONARIES = "manage-system-dictionaries";
    public const string MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS = "manage-functional-roles-and-permissions";
    public const string VIEW_DASHBOARD = "view-dashboard";

    public static IReadOnlyList<PermissionDefinition> Definitions { get; } =
    [
        new(CREATE_FORM_CAMPAIGNS),
        new(CREATE_ACTION_ITEMS),
        new(CREATE_EDIT_RISKS),
        new(CREATE_RESOURCING_REQUESTS),
        new(FULFIL_RESOURCING_REQUESTS),
        new(APPROVE_REJECT_RESOURCING_CANDIDATES),
        new(CLOSE_RESOURCING_REQUESTS),
        new(ASSIGN_MENTORS),
        new(MAINTAIN_CDS_RECORDS),
        new(EDIT_CAREER_TIMELINE),
        new(CREATE_FEEDBACK),
        new(RECORD_DEPARTURE),
        new(MANAGE_DEPARTMENTS),
        new(MANAGE_CUSTOM_FIELDS),
        new(CHANGE_ORGANISATIONAL_RELATIONSHIPS),
        new(MANAGE_SYSTEM_DICTIONARIES),
        new(MANAGE_FUNCTIONAL_ROLES_AND_PERMISSIONS),
        new(VIEW_DASHBOARD, RequiresDashboardScope: true),
    ];

    public static bool Contains(string permissionKey) =>
        Definitions.Any(definition => definition.Key == permissionKey);

    public static bool RequiresScope(string permissionKey) =>
        Definitions.SingleOrDefault(definition => definition.Key == permissionKey)?.RequiresDashboardScope == true;
}
