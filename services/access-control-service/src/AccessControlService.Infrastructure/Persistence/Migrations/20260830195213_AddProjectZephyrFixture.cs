using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectZephyrFixture : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "project_assignments",
                columns: new[] { "Id", "PersonId", "ProjectId", "Role" },
                values: new object[] { new Guid("44444444-0000-0000-0000-000000000007"), new Guid("22222222-0000-0000-0000-000000000003"), new Guid("33333333-0000-0000-0000-000000000003"), 2 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "project_assignments",
                keyColumn: "Id",
                keyValue: new Guid("44444444-0000-0000-0000-000000000007"));
        }
    }
}
