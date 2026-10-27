using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Moves every entry's article out of <c>Entities.Content</c> into a row of its own, and gives it a history of its own.
    /// See <c>docs/architecture/decisions/0028-entity-article.md</c>.
    ///
    /// Nothing authored is manufactured or lost. An article moves byte for byte, dated by the entry's last change, and
    /// becomes version 1 of its history; an entry with no article gets no row and no version. Summaries and fields are not
    /// read. Entry revisions keep the copy of the article each already holds.
    ///
    /// The column is dropped with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table rebuild. A
    /// rebuild of <c>Entities</c> drops the table every other lore table points at, and with it the search index's delete
    /// trigger, which EF Core does not know exists (ADR 0016). The native drop touches neither: nothing indexes, constrains
    /// or triggers on <c>Content</c>.
    /// </summary>
    public partial class AddEntityArticles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityArticles",
                columns: table => new
                {
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Content = table.Column<string>(type: "TEXT", maxLength: 200000, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityArticles", x => x.EntityId);
                    table.ForeignKey(
                        name: "FK_EntityArticles_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityArticleRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    RestoredFromRevisionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Content = table.Column<string>(type: "TEXT", maxLength: 200000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityArticleRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityArticleRevisions_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityArticleRevisions_EntityId_Number",
                table: "EntityArticleRevisions",
                columns: new[] { "EntityId", "Number" },
                unique: true);

            // Every article, exactly as stored. A blank value was never an article: the write path always stored null.
            migrationBuilder.Sql("""
                INSERT INTO "EntityArticles" ("EntityId", "Content", "UpdatedAt")
                SELECT "Id", "Content", "UpdatedAt"
                FROM "Entities"
                WHERE "Content" IS NOT NULL AND trim("Content") <> '';
                """);

            // Version 1 of each article's history is the article as it stands, so what was written before the move can be
            // put back once it is edited. Kind 0 is Created. Ids are 128 random bits in the uppercase text form the rest
            // of the schema stores a Guid in; each part is drawn on its own, so no expression has to be evaluated once.
            migrationBuilder.Sql("""
                INSERT INTO "EntityArticleRevisions"
                    ("Id", "EntityId", "Number", "Kind", "RestoredFromRevisionId", "CreatedAt", "Content")
                SELECT
                    hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-'
                        || hex(randomblob(2)) || '-' || hex(randomblob(6)),
                    "EntityId", 1, 0, NULL, "UpdatedAt", "Content"
                FROM "EntityArticles";
                """);

            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "Content";""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The article as it stands goes back on the entry; a cleared one is no article, as before. The article's own
            // history is discarded - the schema before this had nowhere to keep it.
            migrationBuilder.AddColumn<string>(
                name: "Content",
                table: "Entities",
                type: "TEXT",
                maxLength: 200000,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "Entities" SET "Content" = (
                    SELECT a."Content" FROM "EntityArticles" AS a
                    WHERE a."EntityId" = "Entities"."Id" AND a."Content" <> '');
                """);

            migrationBuilder.DropTable(
                name: "EntityArticleRevisions");

            migrationBuilder.DropTable(
                name: "EntityArticles");
        }
    }
}
