using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStoryPlotArcsAndBeats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlotArcs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlotArcs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlotArcs_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlotBeats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlotArcId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlotBeats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlotBeats_PlotArcs_PlotArcId",
                        column: x => x.PlotArcId,
                        principalTable: "PlotArcs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlotBeatEntities",
                columns: table => new
                {
                    PlotBeatId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlotBeatEntities", x => new { x.PlotBeatId, x.EntityId });
                    table.ForeignKey(
                        name: "FK_PlotBeatEntities_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlotBeatEntities_PlotBeats_PlotBeatId",
                        column: x => x.PlotBeatId,
                        principalTable: "PlotBeats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlotBeatScenes",
                columns: table => new
                {
                    PlotBeatId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlotBeatScenes", x => new { x.PlotBeatId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_PlotBeatScenes_PlotBeats_PlotBeatId",
                        column: x => x.PlotBeatId,
                        principalTable: "PlotBeats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PlotBeatScenes_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlotArcs_StoryId_SortOrder",
                table: "PlotArcs",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeatEntities_EntityId",
                table: "PlotBeatEntities",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeatScenes_SceneId",
                table: "PlotBeatScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeats_PlotArcId_SortOrder",
                table: "PlotBeats",
                columns: new[] { "PlotArcId", "SortOrder" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlotBeatEntities");

            migrationBuilder.DropTable(
                name: "PlotBeatScenes");

            migrationBuilder.DropTable(
                name: "PlotBeats");

            migrationBuilder.DropTable(
                name: "PlotArcs");
        }
    }
}
