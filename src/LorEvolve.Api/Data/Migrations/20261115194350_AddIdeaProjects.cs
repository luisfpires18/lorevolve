using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// An idea may be a note for one of its universe's projects (#197): a nullable Ideas.ProjectId, SET NULL when the
    /// project goes, and its index. Existing ideas get NULL and nothing else about them changes.
    ///
    /// Written by hand in both directions. The generated form adds the foreign key with AddForeignKey, which SQLite can
    /// only do by rebuilding the table, and a rebuild of Ideas drops its FTS5 search triggers
    /// (IdeaSearchIndex_IdeaInserted, _IdeaUpdated and _IdeaDeleted) without recreating them. SQLite's own
    /// ALTER TABLE ... ADD COLUMN accepts a REFERENCES clause for a column whose default is NULL, and ALTER TABLE ...
    /// DROP COLUMN (3.35 and later; this schema runs on 3.50) removes it again, so neither direction rebuilds anything.
    /// </summary>
    public partial class AddIdeaProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """ALTER TABLE "Ideas" ADD COLUMN "ProjectId" TEXT NULL CONSTRAINT "FK_Ideas_CreativeProjects_ProjectId" REFERENCES "CreativeProjects" ("Id") ON DELETE SET NULL;""");

            migrationBuilder.CreateIndex(
                name: "IX_Ideas_ProjectId_DeletedAt_UpdatedAt",
                table: "Ideas",
                columns: new[] { "ProjectId", "DeletedAt", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Ideas_ProjectId_DeletedAt_UpdatedAt",
                table: "Ideas");

            migrationBuilder.Sql("""ALTER TABLE "Ideas" DROP COLUMN "ProjectId";""");
        }
    }
}
