using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class EnforceFunctionalRoleGrantScopeUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM functional_role_permission_grants
                        WHERE "Scope" IS NULL
                        GROUP BY "FunctionalRoleId", "PermissionId"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE EXCEPTION
                            'Cannot enforce functional-role grant uniqueness: duplicate unscoped grants exist.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permissi~",
                table: "functional_role_permission_grants");

            migrationBuilder.CreateIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permiss~1",
                table: "functional_role_permission_grants",
                columns: new[] { "FunctionalRoleId", "PermissionId", "Scope" },
                unique: true,
                filter: "\"Scope\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permissi~",
                table: "functional_role_permission_grants",
                columns: new[] { "FunctionalRoleId", "PermissionId" },
                unique: true,
                filter: "\"Scope\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permiss~1",
                table: "functional_role_permission_grants");

            migrationBuilder.DropIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permissi~",
                table: "functional_role_permission_grants");

            migrationBuilder.CreateIndex(
                name: "IX_functional_role_permission_grants_FunctionalRoleId_Permissi~",
                table: "functional_role_permission_grants",
                columns: new[] { "FunctionalRoleId", "PermissionId", "Scope" },
                unique: true);
        }
    }
}
