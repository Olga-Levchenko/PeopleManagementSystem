using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "departments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "text", nullable: false),
                    ParentDepartmentId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_departments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_departments_departments_ParentDepartmentId",
                        column: x => x.ParentDepartmentId,
                        principalTable: "departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "people",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "text", nullable: false),
                    ManagerId = table.Column<Guid>(type: "uuid", nullable: true),
                    DepartmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ManagesDepartmentId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_people", x => x.Id);
                    table.ForeignKey(
                        name: "FK_people_departments_DepartmentId",
                        column: x => x.DepartmentId,
                        principalTable: "departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_people_departments_ManagesDepartmentId",
                        column: x => x.ManagesDepartmentId,
                        principalTable: "departments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_people_people_ManagerId",
                        column: x => x.ManagerId,
                        principalTable: "people",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "departments",
                columns: new[] { "Id", "Label", "ParentDepartmentId" },
                values: new object[,]
                {
                    { new Guid("11111111-0000-0000-0000-000000000001"), "Fixture Dept: Headquarters", null },
                    { new Guid("11111111-0000-0000-0000-000000000002"), "Fixture Dept: Engineering", new Guid("11111111-0000-0000-0000-000000000001") }
                });

            migrationBuilder.InsertData(
                table: "people",
                columns: new[] { "Id", "DepartmentId", "Label", "ManagerId", "ManagesDepartmentId" },
                values: new object[] { new Guid("22222222-0000-0000-0000-000000000001"), new Guid("11111111-0000-0000-0000-000000000001"), "Fixture Person: Executive", null, new Guid("11111111-0000-0000-0000-000000000001") });

            migrationBuilder.InsertData(
                table: "departments",
                columns: new[] { "Id", "Label", "ParentDepartmentId" },
                values: new object[] { new Guid("11111111-0000-0000-0000-000000000003"), "Fixture Dept: Platform", new Guid("11111111-0000-0000-0000-000000000002") });

            migrationBuilder.InsertData(
                table: "people",
                columns: new[] { "Id", "DepartmentId", "Label", "ManagerId", "ManagesDepartmentId" },
                values: new object[,]
                {
                    { new Guid("22222222-0000-0000-0000-000000000002"), new Guid("11111111-0000-0000-0000-000000000002"), "Fixture Person: Director", new Guid("22222222-0000-0000-0000-000000000001"), new Guid("11111111-0000-0000-0000-000000000002") },
                    { new Guid("22222222-0000-0000-0000-000000000003"), new Guid("11111111-0000-0000-0000-000000000003"), "Fixture Person: Platform Lead", new Guid("22222222-0000-0000-0000-000000000002"), new Guid("11111111-0000-0000-0000-000000000003") },
                    { new Guid("22222222-0000-0000-0000-000000000004"), new Guid("11111111-0000-0000-0000-000000000003"), "Fixture Person: Engineer", new Guid("22222222-0000-0000-0000-000000000003"), null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_departments_ParentDepartmentId",
                table: "departments",
                column: "ParentDepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_people_DepartmentId",
                table: "people",
                column: "DepartmentId");

            migrationBuilder.CreateIndex(
                name: "IX_people_ManagerId",
                table: "people",
                column: "ManagerId");

            migrationBuilder.CreateIndex(
                name: "IX_people_ManagesDepartmentId",
                table: "people",
                column: "ManagesDepartmentId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "people");

            migrationBuilder.DropTable(
                name: "departments");
        }
    }
}
