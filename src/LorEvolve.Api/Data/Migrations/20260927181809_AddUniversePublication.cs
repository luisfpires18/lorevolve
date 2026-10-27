using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Publishing (ADR 0036). Additive only: six columns on <c>Universes</c>, one on <c>AspNetUsers</c>, the
    /// <c>UniverseArtworks</c> table and two indexes. <c>Visibility</c> defaults to 0, <c>Private</c>, so every
    /// universe that exists when this runs is private, with no summary, category, genre, artwork, address or
    /// publication date - nothing public is generated here, and nothing is copied from a description. No account
    /// gains a public name. Nothing is rebuilt on the way up.
    ///
    /// Rolling back drops the table, the two indexes, then each column with SQLite's own <c>ALTER TABLE ... DROP
    /// COLUMN</c> rather than EF Core's table rebuild, which would recreate <c>Universes</c> and <c>AspNetUsers</c>
    /// under everything that points at them. No trigger names these columns; the indexes that do go first. Every
    /// public detail, artwork row and public name is lost with them; the artwork objects stay in the bucket,
    /// named by nothing.
    /// </summary>
    public partial class AddUniversePublication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Category",
                table: "Universes",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Genres",
                table: "Universes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PublicSlug",
                table: "Universes",
                type: "TEXT",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicSummary",
                table: "Universes",
                type: "TEXT",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PublishedAt",
                table: "Universes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "Universes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "PublicDisplayName",
                table: "AspNetUsers",
                type: "TEXT",
                maxLength: 60,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UniverseArtworks",
                columns: table => new
                {
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CardKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CropX = table.Column<double>(type: "REAL", nullable: false),
                    CropY = table.Column<double>(type: "REAL", nullable: false),
                    CropWidth = table.Column<double>(type: "REAL", nullable: false),
                    CropHeight = table.Column<double>(type: "REAL", nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    ByteSize = table.Column<long>(type: "INTEGER", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UniverseArtworks", x => x.UniverseId);
                    table.ForeignKey(
                        name: "FK_UniverseArtworks_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Universes_PublicSlug",
                table: "Universes",
                column: "PublicSlug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Universes_Visibility_PublishedAt",
                table: "Universes",
                columns: new[] { "Visibility", "PublishedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UniverseArtworks");

            migrationBuilder.DropIndex(
                name: "IX_Universes_PublicSlug",
                table: "Universes");

            migrationBuilder.DropIndex(
                name: "IX_Universes_Visibility_PublishedAt",
                table: "Universes");

            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "Category";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "Genres";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "PublicSlug";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "PublicSummary";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "PublishedAt";""");
            migrationBuilder.Sql("""ALTER TABLE "Universes" DROP COLUMN "Visibility";""");
            migrationBuilder.Sql("""ALTER TABLE "AspNetUsers" DROP COLUMN "PublicDisplayName";""");
        }
    }
}
