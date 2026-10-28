using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Content recovery for stories: a Trash marker on stories, chapters, scenes, arcs and beats, and a saved-version
    /// history for scene manuscripts. See <c>docs/architecture/decisions/0029-content-recovery.md</c>.
    ///
    /// Nothing authored is rewritten. Every existing row gains a null marker - it is live - and keeps its place, so each
    /// order stays exactly as it was. The order indexes are recreated to guard live rows only, because a row in the Trash
    /// keeps the number it had and holds no place. Each existing manuscript becomes version 1 of its own history, dated by
    /// its last save, so what was written before can be put back once it is edited.
    ///
    /// Rolling back discards the Trash - the schema before this had none, and a delete there was permanent - along with
    /// every manuscript's history, and drops the markers with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than
    /// EF Core's table rebuild, which would drop and recreate <c>Scenes</c> under the four tables that point at it.
    /// </summary>
    public partial class AddContentRecovery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Scenes_ChapterId_SortOrder",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_PlotBeats_PlotArcId_SortOrder",
                table: "PlotBeats");

            migrationBuilder.DropIndex(
                name: "IX_PlotArcs_StoryId_SortOrder",
                table: "PlotArcs");

            migrationBuilder.DropIndex(
                name: "IX_Chapters_StoryId_SortOrder",
                table: "Chapters");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Stories",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Scenes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "PlotBeats",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "PlotArcs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Chapters",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SceneManuscriptRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    RestoredFromRevisionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Content = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SceneManuscriptRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SceneManuscriptRevisions_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_ChapterId",
                table: "Scenes",
                column: "ChapterId");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_ChapterId_SortOrder",
                table: "Scenes",
                columns: new[] { "ChapterId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NOT NULL AND \"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NULL AND \"DeletedAt\" IS NULL");

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

            migrationBuilder.CreateIndex(
                name: "IX_PlotArcs_StoryId",
                table: "PlotArcs",
                column: "StoryId");

            migrationBuilder.CreateIndex(
                name: "IX_PlotArcs_StoryId_SortOrder",
                table: "PlotArcs",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_StoryId",
                table: "Chapters",
                column: "StoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_StoryId_SortOrder",
                table: "Chapters",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true,
                filter: "\"DeletedAt\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SceneManuscriptRevisions_SceneId_Number",
                table: "SceneManuscriptRevisions",
                columns: new[] { "SceneId", "Number" },
                unique: true);

            // Version 1 of each manuscript's history is the prose as it stands, byte for byte, dated by its last save - an
            // emptied manuscript included, so the newest version is always the text as stored. Kind 0 is Created. Ids are 128
            // random bits in the uppercase text form the rest of the schema stores a Guid in; each part is drawn on its own,
            // so no expression has to be evaluated once.
            migrationBuilder.Sql("""
                INSERT INTO "SceneManuscriptRevisions"
                    ("Id", "SceneId", "Number", "Kind", "RestoredFromRevisionId", "CreatedAt", "Content")
                SELECT
                    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-'
                        || hex(randomblob(2)) || '-' || hex(randomblob(6)),
                    "SceneId", 1, 0, NULL, "UpdatedAt", "Content"
                FROM "SceneManuscripts";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The history goes first: the schema before this had nowhere to keep it.
            migrationBuilder.DropTable(
                name: "SceneManuscriptRevisions");

            // Then the Trash, which that schema had no way to hold: a story, scene, chapter, arc or beat in it goes for good,
            // with what a permanent delete there always took. Dependants are removed by name rather than left to the cascade,
            // so the rollback does not rest on the connection's foreign-key setting. Links from a live beat to a discarded
            // scene go too, exactly as deleting that scene did.
            migrationBuilder.Sql("""
                DELETE FROM "PlotBeatScenes"
                WHERE "PlotBeatId" IN (
                        SELECT "Id" FROM "PlotBeats"
                        WHERE "DeletedAt" IS NOT NULL
                            OR "PlotArcId" IN (
                                SELECT "Id" FROM "PlotArcs"
                                WHERE "DeletedAt" IS NOT NULL
                                    OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL)))
                    OR "SceneId" IN (
                        SELECT "Id" FROM "Scenes"
                        WHERE "DeletedAt" IS NOT NULL
                            OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL));

                DELETE FROM "PlotBeatEntities"
                WHERE "PlotBeatId" IN (
                    SELECT "Id" FROM "PlotBeats"
                    WHERE "DeletedAt" IS NOT NULL
                        OR "PlotArcId" IN (
                            SELECT "Id" FROM "PlotArcs"
                            WHERE "DeletedAt" IS NOT NULL
                                OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL)));

                DELETE FROM "PlotBeats"
                WHERE "DeletedAt" IS NOT NULL
                    OR "PlotArcId" IN (
                        SELECT "Id" FROM "PlotArcs"
                        WHERE "DeletedAt" IS NOT NULL
                            OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL));

                DELETE FROM "PlotArcs"
                WHERE "DeletedAt" IS NOT NULL
                    OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL);

                DELETE FROM "SceneEntityLinks"
                WHERE "SceneId" IN (
                    SELECT "Id" FROM "Scenes"
                    WHERE "DeletedAt" IS NOT NULL
                        OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL));

                DELETE FROM "SceneManuscripts"
                WHERE "SceneId" IN (
                    SELECT "Id" FROM "Scenes"
                    WHERE "DeletedAt" IS NOT NULL
                        OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL));

                DELETE FROM "Scenes"
                WHERE "DeletedAt" IS NOT NULL
                    OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL);

                DELETE FROM "Chapters"
                WHERE "DeletedAt" IS NOT NULL
                    OR "StoryId" IN (SELECT "Id" FROM "Stories" WHERE "DeletedAt" IS NOT NULL);

                DELETE FROM "Stories" WHERE "DeletedAt" IS NOT NULL;
                """);

            migrationBuilder.DropIndex(
                name: "IX_Scenes_ChapterId",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_ChapterId_SortOrder",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes");

            migrationBuilder.DropIndex(
                name: "IX_PlotBeats_PlotArcId",
                table: "PlotBeats");

            migrationBuilder.DropIndex(
                name: "IX_PlotBeats_PlotArcId_SortOrder",
                table: "PlotBeats");

            migrationBuilder.DropIndex(
                name: "IX_PlotArcs_StoryId",
                table: "PlotArcs");

            migrationBuilder.DropIndex(
                name: "IX_PlotArcs_StoryId_SortOrder",
                table: "PlotArcs");

            migrationBuilder.DropIndex(
                name: "IX_Chapters_StoryId",
                table: "Chapters");

            migrationBuilder.DropIndex(
                name: "IX_Chapters_StoryId_SortOrder",
                table: "Chapters");

            // No index, constraint or trigger names a marker once the filtered indexes are gone, so the native drop applies.
            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "DeletedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "Scenes" DROP COLUMN "DeletedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "PlotBeats" DROP COLUMN "DeletedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "PlotArcs" DROP COLUMN "DeletedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "Chapters" DROP COLUMN "DeletedAt";""");

            // Every row left is live, and live orders are contiguous and unique, so the old indexes hold as they did.
            migrationBuilder.CreateIndex(
                name: "IX_Scenes_ChapterId_SortOrder",
                table: "Scenes",
                columns: new[] { "ChapterId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PlotBeats_PlotArcId_SortOrder",
                table: "PlotBeats",
                columns: new[] { "PlotArcId", "SortOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlotArcs_StoryId_SortOrder",
                table: "PlotArcs",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_StoryId_SortOrder",
                table: "Chapters",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true);
        }
    }
}
