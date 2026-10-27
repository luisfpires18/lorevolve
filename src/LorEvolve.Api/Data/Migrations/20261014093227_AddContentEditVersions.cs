using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// The edit version every protected save names (ADR 0043): entries, articles, stories, scenes and manuscripts. A plain
    /// column added in place, so no table is rebuilt and no search trigger is touched. Every existing row starts at 1 - the
    /// value a newly created row gets - so legacy content is editable at once; an article or manuscript that has no row is
    /// version 0 until its first save.
    /// </summary>
    public partial class AddContentEditVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Entities",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "EntityArticles",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Stories",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Scenes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "SceneManuscripts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // SQLite's own DROP COLUMN, so the tables are not rebuilt and their search triggers survive.
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "Version";""");
            migrationBuilder.Sql("""ALTER TABLE "EntityArticles" DROP COLUMN "Version";""");
            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "Version";""");
            migrationBuilder.Sql("""ALTER TABLE "Scenes" DROP COLUMN "Version";""");
            migrationBuilder.Sql("""ALTER TABLE "SceneManuscripts" DROP COLUMN "Version";""");
        }
    }
}
