using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// The author's orders: a story's place in its universe's list, and a scene's lore in the order it was picked. Both start
    /// as they read before - stories by title, a scene's lore by the entry's name - so nothing moves on screen. Rolling back
    /// drops the two columns in place (SQLite's own DROP COLUMN), so no table is rebuilt and the story search triggers stay.
    /// </summary>
    public partial class KeepAuthorOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Stories",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "SceneEntityLinks",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                UPDATE "Stories" SET "SortOrder" = (
                    SELECT COUNT(*) FROM "Stories" AS "other"
                    WHERE "other"."UniverseId" = "Stories"."UniverseId"
                      AND ("other"."Title" < "Stories"."Title"
                           OR ("other"."Title" = "Stories"."Title" AND "other"."Id" < "Stories"."Id")));
                """);

            migrationBuilder.Sql(
                """
                UPDATE "SceneEntityLinks" SET "SortOrder" = (
                    SELECT COUNT(*) FROM "SceneEntityLinks" AS "other"
                    JOIN "Entities" AS "otherEntity" ON "otherEntity"."Id" = "other"."EntityId"
                    JOIN "Entities" AS "mine" ON "mine"."Id" = "SceneEntityLinks"."EntityId"
                    WHERE "other"."SceneId" = "SceneEntityLinks"."SceneId"
                      AND ("otherEntity"."Name" < "mine"."Name"
                           OR ("otherEntity"."Name" = "mine"."Name" AND "other"."EntityId" < "SceneEntityLinks"."EntityId")));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"Stories\" DROP COLUMN \"SortOrder\";");
            migrationBuilder.Sql("ALTER TABLE \"SceneEntityLinks\" DROP COLUMN \"SortOrder\";");
        }
    }
}
