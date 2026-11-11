using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Arcs become story structure and beats move into scenes (ADR 0070). Plot beats, their links and the ideas' references
    /// to them are dropped, and so is every existing arc: the owner chose to start the new structure empty rather than guess
    /// where an old arc's chapters were. <c>ChapterArcs</c> is a side table rather than a column on <c>Chapters</c>, so no table
    /// the search triggers name is rebuilt, and <c>SceneBeats</c> holds each scene's beats.
    ///
    /// AI change proposals that held a plot beat change go whole, as the media migration's rollback did for its own resource:
    /// a stored beat change can no longer be read, checked or applied. Rolling back recreates the plot beat tables and their
    /// search triggers empty; the arcs, beats and links deleted here do not come back.
    /// </summary>
    public partial class RestructureStoryArcs : Migration
    {
        /// <summary>The search index's text cleaning, as <c>AddUniverseSearchIndex</c> wrote it.</summary>
        private static string Clean(string value) => $"replace(replace({value}, char(57344), ' '), char(57345), ' ')";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS StorySearchIndex_PlotBeatInserted;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS StorySearchIndex_PlotBeatUpdated;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS StorySearchIndex_PlotBeatDeleted;");
            migrationBuilder.Sql("DELETE FROM StorySearchIndex WHERE Kind = 'beat';");

            // 9 was a plot beat.
            migrationBuilder.Sql("DELETE FROM \"AiChangeOperations\" WHERE \"ProposalId\" IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\" WHERE \"Resource\" = 9);");
            migrationBuilder.Sql("DELETE FROM \"AiChangeProposals\" WHERE \"Id\" NOT IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\");");

            // Every old arc goes, live or in the Trash; its idea references follow it, and its search row by trigger.
            migrationBuilder.Sql("DELETE FROM \"IdeaPlotArcReferences\";");
            migrationBuilder.Sql("DELETE FROM \"PlotArcs\";");

            migrationBuilder.DropTable(
                name: "IdeaPlotBeatReferences");

            migrationBuilder.DropTable(
                name: "PlotBeatEntities");

            migrationBuilder.DropTable(
                name: "PlotBeatScenes");

            migrationBuilder.DropTable(
                name: "PlotBeats");

            migrationBuilder.CreateTable(
                name: "ChapterArcs",
                columns: table => new
                {
                    ChapterId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlotArcId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChapterArcs", x => x.ChapterId);
                    table.ForeignKey(
                        name: "FK_ChapterArcs_Chapters_ChapterId",
                        column: x => x.ChapterId,
                        principalTable: "Chapters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChapterArcs_PlotArcs_PlotArcId",
                        column: x => x.PlotArcId,
                        principalTable: "PlotArcs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SceneBeats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SceneBeats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SceneBeats_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChapterArcs_PlotArcId",
                table: "ChapterArcs",
                column: "PlotArcId");

            migrationBuilder.CreateIndex(
                name: "IX_SceneBeats_SceneId_SortOrder",
                table: "SceneBeats",
                columns: new[] { "SceneId", "SortOrder" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChapterArcs");

            migrationBuilder.DropTable(
                name: "SceneBeats");

            migrationBuilder.CreateTable(
                name: "PlotBeats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PlotArcId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
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
                name: "IX_IdeaPlotBeatReferences_PlotBeatId",
                table: "IdeaPlotBeatReferences",
                column: "PlotBeatId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeatEntities_EntityId",
                table: "PlotBeatEntities",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeatScenes_SceneId",
                table: "PlotBeatScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeats_PlotArcId",
                table: "PlotBeats",
                column: "PlotArcId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeats_PlotArcId_SortOrder",
                table: "PlotBeats",
                columns: new[] { "PlotArcId", "SortOrder" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            var insert = $"""
                INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
                VALUES ('beat', new.Id, {Clean("new.Title")}, {Clean("coalesce(new.Description, '')")}, {Clean("coalesce(new.Notes, '')")});
                """;

            migrationBuilder.Sql($"""
                CREATE TRIGGER StorySearchIndex_PlotBeatInserted AFTER INSERT ON PlotBeats BEGIN
                    {insert}
                END;
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER StorySearchIndex_PlotBeatUpdated AFTER UPDATE OF Title, Description, Notes ON PlotBeats
                WHEN old.Title IS NOT new.Title OR old.Description IS NOT new.Description OR old.Notes IS NOT new.Notes
                BEGIN
                    DELETE FROM StorySearchIndex WHERE Kind = 'beat' AND ItemId = old.Id;
                    {insert}
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER StorySearchIndex_PlotBeatDeleted AFTER DELETE ON PlotBeats BEGIN
                    DELETE FROM StorySearchIndex WHERE Kind = 'beat' AND ItemId = old.Id;
                END;
                """);
        }
    }
}
