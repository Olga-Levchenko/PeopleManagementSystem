using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPmDmMultiPathFixture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "people",
                columns: new[] { "Id", "DepartmentId", "Label", "ManagerId", "ManagesDepartmentId", "PeoplePartnerId" },
                values: new object[] { new Guid("22222222-0000-0000-0000-00000000000b"), null, "Fixture Person: DM on Project Phoenix + PM on Project Orion (multi-path)", null, null, null });

            migrationBuilder.InsertData(
                table: "project_assignments",
                columns: new[] { "Id", "PersonId", "ProjectId", "Role" },
                values: new object[,]
                {
                    { new Guid("44444444-0000-0000-0000-000000000008"), new Guid("22222222-0000-0000-0000-00000000000b"), new Guid("33333333-0000-0000-0000-000000000001"), 2 },
                    { new Guid("44444444-0000-0000-0000-000000000009"), new Guid("22222222-0000-0000-0000-00000000000b"), new Guid("33333333-0000-0000-0000-000000000002"), 1 },
                    { new Guid("44444444-0000-0000-0000-00000000000a"), new Guid("22222222-0000-0000-0000-000000000007"), new Guid("33333333-0000-0000-0000-000000000002"), 0 },
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "project_assignments",
                keyColumn: "Id",
                keyValue: new Guid("44444444-0000-0000-0000-00000000000a"));

            migrationBuilder.DeleteData(
                table: "project_assignments",
                keyColumn: "Id",
                keyValue: new Guid("44444444-0000-0000-0000-000000000009"));

            migrationBuilder.DeleteData(
                table: "project_assignments",
                keyColumn: "Id",
                keyValue: new Guid("44444444-0000-0000-0000-000000000008"));

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-00000000000b"));
        }
    }
}
