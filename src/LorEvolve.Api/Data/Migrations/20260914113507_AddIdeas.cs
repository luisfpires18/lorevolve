using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIdeas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Ideas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<string>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Body = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Ideas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Ideas_AspNetUsers_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Ideas_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "IdeaEntityReferences",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaEntityReferences", x => new { x.IdeaId, x.EntityId });
                    table.ForeignKey(
                        name: "FK_IdeaEntityReferences_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaEntityReferences_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaPlotArcReferences",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlotArcId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaPlotArcReferences", x => new { x.IdeaId, x.PlotArcId });
                    table.ForeignKey(
                        name: "FK_IdeaPlotArcReferences_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaPlotArcReferences_PlotArcs_PlotArcId",
                        column: x => x.PlotArcId,
                        principalTable: "PlotArcs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaPlotBeatReferences",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlotBeatId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaPlotBeatReferences", x => new { x.IdeaId, x.PlotBeatId });
                    table.ForeignKey(
                        name: "FK_IdeaPlotBeatReferences_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaPlotBeatReferences_PlotBeats_PlotBeatId",
                        column: x => x.PlotBeatId,
                        principalTable: "PlotBeats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaSceneReferences",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaSceneReferences", x => new { x.IdeaId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_IdeaSceneReferences_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaSceneReferences_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaStoryReferences",
                columns: table => new
                {
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaStoryReferences", x => new { x.IdeaId, x.StoryId });
                    table.ForeignKey(
                        name: "FK_IdeaStoryReferences_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaStoryReferences_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaEntityReferences_EntityId",
                table: "IdeaEntityReferences",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaPlotArcReferences_PlotArcId",
                table: "IdeaPlotArcReferences",
                column: "PlotArcId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaPlotBeatReferences_PlotBeatId",
                table: "IdeaPlotBeatReferences",
                column: "PlotBeatId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaSceneReferences_SceneId",
                table: "IdeaSceneReferences",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaStoryReferences_StoryId",
                table: "IdeaStoryReferences",
                column: "StoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_OwnerId_DeletedAt_UpdatedAt",
                table: "Ideas",
                columns: new[] { "OwnerId", "DeletedAt", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_UniverseId_DeletedAt_UpdatedAt",
                table: "Ideas",
                columns: new[] { "UniverseId", "DeletedAt", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IdeaEntityReferences");

            migrationBuilder.DropTable(
                name: "IdeaPlotArcReferences");

            migrationBuilder.DropTable(
                name: "IdeaPlotBeatReferences");

            migrationBuilder.DropTable(
                name: "IdeaSceneReferences");

            migrationBuilder.DropTable(
                name: "IdeaStoryReferences");

            migrationBuilder.DropTable(
                name: "Ideas");
        }
    }
}
