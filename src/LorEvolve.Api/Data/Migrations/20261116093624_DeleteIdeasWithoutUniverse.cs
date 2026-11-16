using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Ideas and idea boards live only in a universe (#230). One with no universe is deleted for good, with its references and board
    /// cards (cascade) and its search row (the Ideas delete trigger). There is nothing to restore on the way down.
    /// </summary>
    public partial class DeleteIdeasWithoutUniverse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""DELETE FROM "Ideas" WHERE "UniverseId" IS NULL;""");
            migrationBuilder.Sql("""DELETE FROM "IdeaBoards" WHERE "UniverseId" IS NULL;""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
