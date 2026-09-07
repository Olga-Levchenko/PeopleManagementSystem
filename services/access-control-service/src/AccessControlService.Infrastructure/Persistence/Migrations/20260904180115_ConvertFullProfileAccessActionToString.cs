using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ConvertFullProfileAccessActionToString : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // AlterColumn cannot be used here: Postgres has no implicit integer→text cast and
            // would reject it without a USING expression. Map each stored integer to its enum
            // name (0=Grant, 1=Revoke) so the journal remains human-readable and stable against
            // future enum reordering.
            migrationBuilder.Sql("""
                ALTER TABLE full_profile_access_journal_entries
                    ALTER COLUMN "Action" TYPE text
                    USING CASE WHEN "Action" = 0 THEN 'Grant' WHEN "Action" = 1 THEN 'Revoke' END;
                """);

            migrationBuilder.UpdateData(
                table: "full_profile_access_journal_entries",
                keyColumn: "Id",
                keyValue: new Guid("55555555-0000-0000-0000-000000000002"),
                column: "Action",
                value: "Grant");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE full_profile_access_journal_entries
                    ALTER COLUMN "Action" TYPE integer
                    USING CASE WHEN "Action" = 'Grant' THEN 0 WHEN "Action" = 'Revoke' THEN 1 END;
                """);

            migrationBuilder.UpdateData(
                table: "full_profile_access_journal_entries",
                keyColumn: "Id",
                keyValue: new Guid("55555555-0000-0000-0000-000000000002"),
                column: "Action",
                value: 0);
        }
    }
}
