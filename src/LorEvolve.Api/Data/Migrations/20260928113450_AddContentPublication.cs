using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Content publishing (ADR 0036, Task 010). Additive only: three columns on <c>Entities</c> and three on
    /// <c>Stories</c>, and one unique index on each. <c>Visibility</c> defaults to 0, <c>Private</c>, so every entry
    /// and story that exists when this runs is private, with no address and no publication date - a universe that is
    /// already public comes out of it with nothing inside it published. Nothing is copied or generated, and nothing is
    /// rebuilt on the way up: <c>ADD COLUMN</c> leaves the lore search triggers and every index as they were.
    ///
    /// Rolling back drops the two indexes, then each column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c>
    /// rather than EF Core's table rebuild, which would recreate <c>Entities</c> under its search triggers and
    /// everything that points at it. No trigger names these columns. Every selection, address and date is lost.
    /// </summary>
    public partial class AddContentPublication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublicSlug",
                table: "Stories",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PublishedAt",
                table: "Stories",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "Stories",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PublicSlug",
                table: "Entities",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PublishedAt",
                table: "Entities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "Entities",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_Stories_UniverseId_PublicSlug",
                table: "Stories",
                columns: new[] { "UniverseId", "PublicSlug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_PublicSlug",
                table: "Entities",
                columns: new[] { "UniverseId", "PublicSlug" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Stories_UniverseId_PublicSlug",
                table: "Stories");

            migrationBuilder.DropIndex(
                name: "IX_Entities_UniverseId_PublicSlug",
                table: "Entities");

            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "PublicSlug";""");
            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "PublishedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "Visibility";""");
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "PublicSlug";""");
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "PublishedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "Visibility";""");
        }
    }
}
