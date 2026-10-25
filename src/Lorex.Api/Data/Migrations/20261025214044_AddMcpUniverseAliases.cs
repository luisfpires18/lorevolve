using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMcpUniverseAliases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "McpUniverseAliases",
                columns: table => new
                {
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Alias = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_McpUniverseAliases", x => x.UniverseId);
                    table.ForeignKey(
                        name: "FK_McpUniverseAliases_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_McpUniverseAliases_Alias",
                table: "McpUniverseAliases",
                column: "Alias",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "McpUniverseAliases");
        }
    }
}
