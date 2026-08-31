using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_assignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    PersonId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_project_assignments_people_PersonId",
                        column: x => x.PersonId,
                        principalTable: "people",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "people",
                columns: new[] { "Id", "DepartmentId", "Label", "ManagerId", "ManagesDepartmentId" },
                values: new object[,]
                {
                    { new Guid("22222222-0000-0000-0000-000000000005"), null, "Fixture Person: Delivery Manager (Project Phoenix)", null, null },
                    { new Guid("22222222-0000-0000-0000-000000000006"), null, "Fixture Person: Project Manager (Project Phoenix)", null, null },
                    { new Guid("22222222-0000-0000-0000-000000000007"), null, "Fixture Person: Project Assignee (Project Phoenix)", null, null },
                    { new Guid("22222222-0000-0000-0000-000000000008"), null, "Fixture Person: Delivery Manager (Project Orion, unrelated to Phoenix)", null, null }
                });

            migrationBuilder.InsertData(
                table: "project_assignments",
                columns: new[] { "Id", "PersonId", "ProjectId", "Role" },
                values: new object[,]
                {
                    { new Guid("44444444-0000-0000-0000-000000000005"), new Guid("22222222-0000-0000-0000-000000000003"), new Guid("33333333-0000-0000-0000-000000000002"), 2 },
                    { new Guid("44444444-0000-0000-0000-000000000006"), new Guid("22222222-0000-0000-0000-000000000004"), new Guid("33333333-0000-0000-0000-000000000002"), 0 },
                    { new Guid("44444444-0000-0000-0000-000000000001"), new Guid("22222222-0000-0000-0000-000000000005"), new Guid("33333333-0000-0000-0000-000000000001"), 2 },
                    { new Guid("44444444-0000-0000-0000-000000000002"), new Guid("22222222-0000-0000-0000-000000000006"), new Guid("33333333-0000-0000-0000-000000000001"), 1 },
                    { new Guid("44444444-0000-0000-0000-000000000003"), new Guid("22222222-0000-0000-0000-000000000007"), new Guid("33333333-0000-0000-0000-000000000001"), 0 },
                    { new Guid("44444444-0000-0000-0000-000000000004"), new Guid("22222222-0000-0000-0000-000000000008"), new Guid("33333333-0000-0000-0000-000000000002"), 2 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_assignments_PersonId",
                table: "project_assignments",
                column: "PersonId");

            migrationBuilder.CreateIndex(
                name: "IX_project_assignments_ProjectId_PersonId",
                table: "project_assignments",
                columns: new[] { "ProjectId", "PersonId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_assignments");

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000005"));

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000006"));

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000007"));

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000008"));
        }
    }
}
