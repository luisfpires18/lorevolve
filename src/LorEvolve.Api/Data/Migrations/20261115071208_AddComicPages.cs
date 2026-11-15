using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddComicPages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProjectPages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EpisodeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectPages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectPages_ProjectEpisodes_EpisodeId",
                        column: x => x.EpisodeId,
                        principalTable: "ProjectEpisodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProjectPanels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PageId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    Dialogue = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    CanonEntityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectPanels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProjectPanels_ProjectPages_PageId",
                        column: x => x.PageId,
                        principalTable: "ProjectPages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPages_EpisodeId_SortOrder",
                table: "ProjectPages",
                columns: new[] { "EpisodeId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPanels_CanonEntityId",
                table: "ProjectPanels",
                column: "CanonEntityId",
                filter: "\"CanonEntityId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectPanels_PageId_SortOrder",
                table: "ProjectPanels",
                columns: new[] { "PageId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectPanels");

            migrationBuilder.DropTable(
                name: "ProjectPages");
        }
    }
}
