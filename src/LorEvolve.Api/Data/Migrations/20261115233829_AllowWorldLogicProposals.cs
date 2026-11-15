using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AllowWorldLogicProposals : Migration
    {
        /// <inheritdoc />
        /// <remarks>
        /// A World Logic rule definition (21) and a System (22) become proposable resources, so the check that lists which
        /// resources a staged operation may name has to admit them, as AllowProjectEntryProposals did for a project's entry.
        ///
        /// <para>SQLite changes a check constraint only by rebuilding the table. That is safe here for the reason it was
        /// then: AiChangeOperations carries no triggers.</para>
        /// </remarks>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22)");
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
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20)");
        }
    }
}
