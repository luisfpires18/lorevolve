using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Public reading (Task 011; ADR 0036, 0037). Additive only: <c>Stories.PublicSummary</c> (null for every story - nothing
    /// is copied from a premise, and no story's selection, address or date changes), <c>ProfileImages.IsPublic</c> (false for
    /// every photo - no private photo becomes public), and <c>AspNetUsers.PublicAuthorSlug</c> with its unique index (null
    /// for every account - never derived from a username or email here; the startup backfill mints one from the public name
    /// for each account that already has a public universe, and publishing mints the rest).
    ///
    /// A story selected in Task 010 without a summary stays selected and stops being public: the story predicate now needs
    /// the summary its author writes.
    ///
    /// Rolling back drops the index, then each column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF
    /// Core's table rebuild, which would recreate <c>AspNetUsers</c> and <c>Stories</c> under everything that points at them.
    /// </summary>
    public partial class AddPublicReading : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublicSummary",
                table: "Stories",
                type: "TEXT",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "ProfileImages",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PublicAuthorSlug",
                table: "AspNetUsers",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_PublicAuthorSlug",
                table: "AspNetUsers",
                column: "PublicAuthorSlug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_PublicAuthorSlug",
                table: "AspNetUsers");

            migrationBuilder.Sql("""ALTER TABLE "Stories" DROP COLUMN "PublicSummary";""");
            migrationBuilder.Sql("""ALTER TABLE "ProfileImages" DROP COLUMN "IsPublic";""");
            migrationBuilder.Sql("""ALTER TABLE "AspNetUsers" DROP COLUMN "PublicAuthorSlug";""");
        }
    }
}
