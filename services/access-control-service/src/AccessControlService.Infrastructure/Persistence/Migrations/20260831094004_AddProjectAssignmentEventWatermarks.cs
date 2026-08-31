using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectAssignmentEventWatermarks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_assignment_event_watermarks",
                columns: table => new
                {
                    AggregateId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastAppliedVersion = table.Column<long>(type: "bigint", nullable: false),
                    LastAppliedEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnedProjectId = table.Column<Guid>(type: "uuid", nullable: true),
                    OwnedPersonId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_assignment_event_watermarks", x => x.AggregateId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_assignment_event_watermarks_OwnedProjectId_OwnedPer~",
                table: "project_assignment_event_watermarks",
                columns: new[] { "OwnedProjectId", "OwnedPersonId" },
                unique: true,
                filter: "\"OwnedProjectId\" IS NOT NULL AND \"OwnedPersonId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_assignment_event_watermarks");
        }
    }
}
