using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// A group's priority among its universe's groups. Groups start in the order they were listed in before - by name,
    /// ignoring case - so nothing moves on screen. Rolling back drops the column in place (SQLite's own DROP COLUMN), so no
    /// table is rebuilt and the triggers naming EntityTypeGroups stay.
    /// </summary>
    public partial class OrderTypeGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "EntityTypeGroups",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql(
                """
                UPDATE "EntityTypeGroups" SET "SortOrder" = (
                    SELECT COUNT(*) FROM "EntityTypeGroups" AS "other"
                    WHERE "other"."UniverseId" = "EntityTypeGroups"."UniverseId"
                      AND ("other"."Name" COLLATE NOCASE < "EntityTypeGroups"."Name" COLLATE NOCASE
                           OR ("other"."Name" COLLATE NOCASE = "EntityTypeGroups"."Name" COLLATE NOCASE
                               AND ("other"."Name" < "EntityTypeGroups"."Name"
                                    OR ("other"."Name" = "EntityTypeGroups"."Name" AND "other"."Id" < "EntityTypeGroups"."Id")))));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE \"EntityTypeGroups\" DROP COLUMN \"SortOrder\";");
        }
    }
}
