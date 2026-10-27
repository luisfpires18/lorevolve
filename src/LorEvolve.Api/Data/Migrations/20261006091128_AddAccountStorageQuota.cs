using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountStorageQuota : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "StorageQuotaBytes",
                table: "AspNetUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1073741824L);

            migrationBuilder.CreateTable(
                name: "StorageReservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Bytes = table.Column<long>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StorageReservations", x => x.Id);
                    table.CheckConstraint("CK_StorageReservations_Bytes", "\"Bytes\" > 0");
                    table.ForeignKey(
                        name: "FK_StorageReservations_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StorageReservations_UserId_ExpiresAt",
                table: "StorageReservations",
                columns: new[] { "UserId", "ExpiresAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StorageReservations");

            migrationBuilder.DropColumn(
                name: "StorageQuotaBytes",
                table: "AspNetUsers");
        }
    }
}
