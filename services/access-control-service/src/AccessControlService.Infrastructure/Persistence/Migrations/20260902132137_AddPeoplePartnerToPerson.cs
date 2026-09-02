using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace AccessControlService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPeoplePartnerToPerson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PeoplePartnerId",
                table: "people",
                type: "uuid",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000001"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000002"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000003"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000004"),
                column: "PeoplePartnerId",
                value: new Guid("22222222-0000-0000-0000-00000000000a"));

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000005"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000006"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000007"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.UpdateData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000008"),
                column: "PeoplePartnerId",
                value: null);

            migrationBuilder.InsertData(
                table: "people",
                columns: new[] { "Id", "DepartmentId", "Label", "ManagerId", "ManagesDepartmentId", "PeoplePartnerId" },
                values: new object[,]
                {
                    { new Guid("22222222-0000-0000-0000-000000000009"), null, "Fixture Person: HR Director", null, null, null },
                    { new Guid("22222222-0000-0000-0000-00000000000a"), null, "Fixture Person: HR Partner (Engineer's assigned PP)", new Guid("22222222-0000-0000-0000-000000000009"), null, null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_people_PeoplePartnerId",
                table: "people",
                column: "PeoplePartnerId");

            migrationBuilder.AddForeignKey(
                name: "FK_people_people_PeoplePartnerId",
                table: "people",
                column: "PeoplePartnerId",
                principalTable: "people",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_people_people_PeoplePartnerId",
                table: "people");

            migrationBuilder.DropIndex(
                name: "IX_people_PeoplePartnerId",
                table: "people");

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-00000000000a"));

            migrationBuilder.DeleteData(
                table: "people",
                keyColumn: "Id",
                keyValue: new Guid("22222222-0000-0000-0000-000000000009"));

            migrationBuilder.DropColumn(
                name: "PeoplePartnerId",
                table: "people");
        }
    }
}
