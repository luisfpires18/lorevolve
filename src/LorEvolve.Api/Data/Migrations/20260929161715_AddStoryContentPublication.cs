using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Story content publication and attribution (Product refinement 015, ADR 0039). Additive only, and nothing becomes
    /// public: <c>Scenes.Visibility</c>, <c>Scenes.ManuscriptVisibility</c> and <c>PlotArcs.Visibility</c> are 0, Private,
    /// for every existing row, so no scene outline, prose or plot arc of any story - public or not - is readable after the
    /// upgrade until its author selects it. <c>Universes.OriginalCreator</c> and <c>OriginalWork</c> are null for every
    /// universe: an original world, as every universe was before.
    ///
    /// Rolling back drops each column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table
    /// rebuild, which would recreate <c>Scenes</c>, <c>PlotArcs</c> and <c>Universes</c> under the search triggers and
    /// foreign keys that point at them.
    /// </summary>
    public partial class AddStoryContentPublication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OriginalCreator",
                table: "Universes",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OriginalWork",
                table: "Universes",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ManuscriptVisibility",
                table: "Scenes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "Scenes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "PlotArcs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "OriginalCreator";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "OriginalWork";""");
            migrationBuilder.Sql("""ALTER TABLE "Scenes" DROP COLUMN "ManuscriptVisibility";""");
            migrationBuilder.Sql("""ALTER TABLE "Scenes" DROP COLUMN "Visibility";""");
            migrationBuilder.Sql("""ALTER TABLE "PlotArcs" DROP COLUMN "Visibility";""");
        }
    }
}
