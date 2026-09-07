using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFullProfileAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "full_profile_access_grants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HolderId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedByActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_full_profile_access_grants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "full_profile_access_journal_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<int>(type: "integer", nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_full_profile_access_journal_entries", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "full_profile_access_grants",
                columns: new[] { "Id", "GrantedAtUtc", "GrantedByActorId", "HolderId" },
                values: new object[] { new Guid("55555555-0000-0000-0000-000000000001"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("22222222-0000-0000-0000-000000000003"), new Guid("22222222-0000-0000-0000-000000000003") });

            migrationBuilder.InsertData(
                table: "full_profile_access_journal_entries",
                columns: new[] { "Id", "Action", "ActorId", "OccurredAtUtc", "SubjectId" },
                values: new object[] { new Guid("55555555-0000-0000-0000-000000000002"), 0, new Guid("22222222-0000-0000-0000-000000000003"), new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new Guid("22222222-0000-0000-0000-000000000003") });

            migrationBuilder.CreateIndex(
                name: "IX_full_profile_access_grants_HolderId",
                table: "full_profile_access_grants",
                column: "HolderId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "full_profile_access_grants");

            migrationBuilder.DropTable(
                name: "full_profile_access_journal_entries");
        }
    }
}
