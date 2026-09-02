using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFunctionalRolesAndPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "authorization_administration_audits",
                columns: table => new
                {
                    AuditId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TargetType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorPersonId = table.Column<Guid>(type: "uuid", nullable: true),
                    TrustedProvisioningActor = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    PermissionKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Scope = table.Column<string>(type: "jsonb", nullable: true),
                    Before = table.Column<string>(type: "jsonb", nullable: true),
                    After = table.Column<string>(type: "jsonb", nullable: true),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CorrelationId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_authorization_administration_audits", x => x.AuditId);
                    table.ForeignKey(
                        name: "FK_authorization_administration_audits_people_ActorPersonId",
                        column: x => x.ActorPersonId,
                        principalTable: "people",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "functional_roles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsSeeded = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeactivatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_functional_roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "permissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresScope = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permissions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "person_functional_role_assignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PersonId = table.Column<Guid>(type: "uuid", nullable: false),
                    FunctionalRoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AssignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_person_functional_role_assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_person_functional_role_assignments_functional_roles_Functio~",
                        column: x => x.FunctionalRoleId,
                        principalTable: "functional_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_person_functional_role_assignments_people_PersonId",
                        column: x => x.PersonId,
                        principalTable: "people",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "functional_role_permission_grants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FunctionalRoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    PermissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Scope = table.Column<string>(type: "jsonb", nullable: true),
                    GrantedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_functional_role_permission_grants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_functional_role_permission_grants_functional_roles_Function~",
                        column: x => x.FunctionalRoleId,
                        principalTable: "functional_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_functional_role_permission_grants_permissions_PermissionId",
                        column: x => x.PermissionId,
                        principalTable: "permissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "functional_roles",
                columns: new[] { "Id", "CreatedAtUtc", "DeactivatedAtUtc", "DisplayName", "IsActive", "IsSeeded", "RoleKey" },
                values: new object[,]
                {
                    { new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "Unit Manager", true, true, "unit-manager" },
                    { new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "Delivery Manager", true, true, "delivery-manager" },
                    { new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "Project Manager", true, true, "project-manager" },
                    { new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "People Partner", true, true, "people-partner" },
                    { new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "HR Admin", true, true, "hr-admin" }
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "Id", "IsActive", "Key", "RequiresScope" },
                values: new object[,]
                {
                    { new Guid("66666666-0000-0000-0000-000000000001"), true, "create-form-campaigns", false },
                    { new Guid("66666666-0000-0000-0000-000000000002"), true, "create-action-items", false },
                    { new Guid("66666666-0000-0000-0000-000000000003"), true, "create-edit-risks", false },
                    { new Guid("66666666-0000-0000-0000-000000000004"), true, "create-resourcing-requests", false },
                    { new Guid("66666666-0000-0000-0000-000000000005"), true, "fulfil-resourcing-requests", false },
                    { new Guid("66666666-0000-0000-0000-000000000006"), true, "approve-reject-resourcing-candidates", false },
                    { new Guid("66666666-0000-0000-0000-000000000007"), true, "close-resourcing-requests", false },
                    { new Guid("66666666-0000-0000-0000-000000000008"), true, "assign-mentors", false },
                    { new Guid("66666666-0000-0000-0000-000000000009"), true, "maintain-cds-records", false },
                    { new Guid("66666666-0000-0000-0000-000000000010"), true, "edit-career-timeline", false },
                    { new Guid("66666666-0000-0000-0000-000000000011"), true, "create-feedback", false },
                    { new Guid("66666666-0000-0000-0000-000000000012"), true, "record-departure", false },
                    { new Guid("66666666-0000-0000-0000-000000000013"), true, "manage-departments", false },
                    { new Guid("66666666-0000-0000-0000-000000000014"), true, "manage-custom-fields", false },
                    { new Guid("66666666-0000-0000-0000-000000000015"), true, "change-organisational-relationships", false },
                    { new Guid("66666666-0000-0000-0000-000000000016"), true, "manage-system-dictionaries", false },
                    { new Guid("66666666-0000-0000-0000-000000000017"), true, "manage-functional-roles-and-permissions", false },
                    { new Guid("66666666-0000-0000-0000-000000000018"), true, "view-dashboard", true }
                });

            migrationBuilder.InsertData(
                table: "functional_role_permission_grants",
                columns: new[] { "Id", "FunctionalRoleId", "GrantedAtUtc", "PermissionId", "Scope" },
                values: new object[,]
                {
                    { new Guid("77777777-0000-0000-0000-000000000001"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000005"), null },
                    { new Guid("77777777-0000-0000-0000-000000000002"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000003"), null },
                    { new Guid("77777777-0000-0000-0000-000000000003"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000002"), null },
                    { new Guid("77777777-0000-0000-0000-000000000004"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000008"), null },
                    { new Guid("77777777-0000-0000-0000-000000000005"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000009"), null },
                    { new Guid("77777777-0000-0000-0000-000000000006"), new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000018"), "{\"dashboardType\":\"unit-manager\"}" },
                    { new Guid("77777777-0000-0000-0000-000000000007"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000004"), null },
                    { new Guid("77777777-0000-0000-0000-000000000008"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000006"), null },
                    { new Guid("77777777-0000-0000-0000-000000000009"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000007"), null },
                    { new Guid("77777777-0000-0000-0000-000000000010"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000003"), null },
                    { new Guid("77777777-0000-0000-0000-000000000011"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000002"), null },
                    { new Guid("77777777-0000-0000-0000-000000000012"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000009"), null },
                    { new Guid("77777777-0000-0000-0000-000000000013"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000008"), null },
                    { new Guid("77777777-0000-0000-0000-000000000014"), new Guid("55555555-0000-0000-0000-000000000002"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000018"), "{\"dashboardType\":\"delivery-manager\"}" },
                    { new Guid("77777777-0000-0000-0000-000000000015"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000004"), null },
                    { new Guid("77777777-0000-0000-0000-000000000016"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000003"), null },
                    { new Guid("77777777-0000-0000-0000-000000000017"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000002"), null },
                    { new Guid("77777777-0000-0000-0000-000000000018"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000009"), null },
                    { new Guid("77777777-0000-0000-0000-000000000019"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000008"), null },
                    { new Guid("77777777-0000-0000-0000-000000000020"), new Guid("55555555-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000018"), "{\"dashboardType\":\"project-manager\"}" },
                    { new Guid("77777777-0000-0000-0000-000000000021"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000001"), null },
                    { new Guid("77777777-0000-0000-0000-000000000022"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000002"), null },
                    { new Guid("77777777-0000-0000-0000-000000000023"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000003"), null },
                    { new Guid("77777777-0000-0000-0000-000000000024"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000008"), null },
                    { new Guid("77777777-0000-0000-0000-000000000025"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000009"), null },
                    { new Guid("77777777-0000-0000-0000-000000000026"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000010"), null },
                    { new Guid("77777777-0000-0000-0000-000000000027"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000011"), null },
                    { new Guid("77777777-0000-0000-0000-000000000028"), new Guid("55555555-0000-0000-0000-000000000004"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000018"), "{\"dashboardType\":\"people-partner\"}" },
                    { new Guid("77777777-0000-0000-0000-000000000029"), new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000013"), null },
                    { new Guid("77777777-0000-0000-0000-000000000030"), new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000014"), null },
                    { new Guid("77777777-0000-0000-0000-000000000031"), new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000016"), null },
                    { new Guid("77777777-0000-0000-0000-000000000032"), new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000017"), null },
                    { new Guid("77777777-0000-0000-0000-000000000033"), new Guid("55555555-0000-0000-0000-000000000005"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("66666666-0000-0000-0000-000000000015"), null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_authorization_administration_audits_ActorPersonId",
                table: "authorization_administration_audits",
                column: "ActorPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_authorization_administration_audits_IdempotencyKey",
                table: "authorization_administration_audits",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_authorization_administration_audits_OccurredAtUtc",
                table: "authorization_administration_audits",
                column: "OccurredAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permissi~",
                table: "functional_role_permission_grants",
                columns: new[] { "FunctionalRoleId", "PermissionId", "Scope" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_functional_role_permission_grants_PermissionId",
                table: "functional_role_permission_grants",
                column: "PermissionId");

            migrationBuilder.CreateIndex(
                name: "IX_functional_roles_DisplayName",
                table: "functional_roles",
                column: "DisplayName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_functional_roles_RoleKey",
                table: "functional_roles",
                column: "RoleKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_permissions_Key",
                table: "permissions",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_person_functional_role_assignments_FunctionalRoleId",
                table: "person_functional_role_assignments",
                column: "FunctionalRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_person_functional_role_assignments_PersonId_FunctionalRoleId",
                table: "person_functional_role_assignments",
                columns: new[] { "PersonId", "FunctionalRoleId" },
                unique: true,
                filter: "\"IsActive\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "authorization_administration_audits");

            migrationBuilder.DropTable(
                name: "functional_role_permission_grants");

            migrationBuilder.DropTable(
                name: "person_functional_role_assignments");

            migrationBuilder.DropTable(
                name: "permissions");

            migrationBuilder.DropTable(
                name: "functional_roles");
        }
    }
}
