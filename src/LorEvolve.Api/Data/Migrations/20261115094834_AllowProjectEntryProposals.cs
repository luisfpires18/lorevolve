using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AllowProjectEntryProposals : Migration
    {
        /// <inheritdoc />
        /// <remarks>
        /// A project's entry becomes a proposable resource (#148), so the check that lists which resources a staged
        /// operation may name has to admit it: without this the database refuses the row with
        /// "CHECK constraint failed: CK_AiChangeOperations_Resource", which is how this was found.
        ///
        /// <para>SQLite changes a check constraint only by rebuilding the table, so this one does. That is safe here
        /// and was checked rather than assumed: AiChangeOperations carries no triggers, unlike "Entities" and
        /// "EntityTypes", where a rebuild would have dropped them silently (#143, #144).</para>
        /// </remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19)");
        }
    }
}
