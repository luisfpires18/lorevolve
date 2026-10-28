using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMapCalibrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MapCalibrations",
                columns: table => new
                {
                    MapId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    X1 = table.Column<double>(type: "REAL", nullable: false),
                    Y1 = table.Column<double>(type: "REAL", nullable: false),
                    X2 = table.Column<double>(type: "REAL", nullable: false),
                    Y2 = table.Column<double>(type: "REAL", nullable: false),
                    Distance = table.Column<double>(type: "REAL", nullable: false),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MapCalibrations", x => x.MapId);
                    table.ForeignKey(
                        name: "FK_MapCalibrations_UniverseMaps_MapId",
                        column: x => x.MapId,
                        principalTable: "UniverseMaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MapCalibrations");
        }
    }
}
