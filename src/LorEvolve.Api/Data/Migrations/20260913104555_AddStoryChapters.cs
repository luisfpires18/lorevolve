using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStoryChapters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes");

            migrationBuilder.AddColumn<Guid>(
                name: "ChapterId",
                table: "Scenes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Chapters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Chapters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Chapters_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_ChapterId_SortOrder",
                table: "Scenes",
                columns: new[] { "ChapterId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_StoryId",
                table: "Scenes",
                column: "StoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true,
                filter: "\"ChapterId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Chapters_StoryId_SortOrder",
                table: "Chapters",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Scenes_Chapters_ChapterId",
                table: "Scenes",
                column: "ChapterId",
                principalTable: "Chapters",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The previous schema has one order per story, and a scene in a chapter only has a place
            // inside that chapter. So before the chapters go, every scene is given its place in the whole
            // story as it reads - Unchaptered first, then chapter by chapter - and let out of its chapter.
            // Rolling back discards the chapters themselves; no scene is lost and none changes places
            // relative to another.
            //
            // By hand, and first, for three reasons. The two per-container indexes would refuse the new
            // positions halfway through the update, so they are dropped before it rather than wherever the
            // generator would put them. The positions are computed into a table of their own first,
            // because an update that counted the rows it was changing would read some already changed.
            // And the generator drops Chapters before it rebuilds Scenes, which SQLite refuses while a
            // scene still points at a chapter.
            migrationBuilder.Sql("""DROP INDEX "IX_Scenes_StoryId_SortOrder";""");
            migrationBuilder.Sql("""DROP INDEX "IX_Scenes_ChapterId_SortOrder";""");

            migrationBuilder.Sql("""
                CREATE TEMP TABLE "ef_scene_reading_order" AS
                SELECT "Scenes"."Id" AS "Id",
                       ROW_NUMBER() OVER (
                           PARTITION BY "Scenes"."StoryId"
                           ORDER BY COALESCE("Chapters"."SortOrder", -1), "Scenes"."SortOrder", "Scenes"."Id") - 1 AS "Position"
                FROM "Scenes"
                LEFT JOIN "Chapters" ON "Chapters"."Id" = "Scenes"."ChapterId";
                """);

            migrationBuilder.Sql("""
                UPDATE "Scenes"
                SET "SortOrder" = (
                        SELECT "Position" FROM "ef_scene_reading_order"
                        WHERE "ef_scene_reading_order"."Id" = "Scenes"."Id"),
                    "ChapterId" = NULL;
                """);

            migrationBuilder.Sql("""DROP TABLE "ef_scene_reading_order";""");

            migrationBuilder.DropForeignKey(
                name: "FK_Scenes_Chapters_ChapterId",
                table: "Scenes");

            migrationBuilder.DropTable(
                name: "Chapters");

            migrationBuilder.DropIndex(
                name: "IX_Scenes_StoryId",
                table: "Scenes");

            migrationBuilder.DropColumn(
                name: "ChapterId",
                table: "Scenes");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_StoryId_SortOrder",
                table: "Scenes",
                columns: new[] { "StoryId", "SortOrder" },
                unique: true);
        }
    }
}
