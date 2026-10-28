using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProgressionProposals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // As AddSchemaProposals: a proposal holding a progression change is review state, and goes with its changes
            // before the narrower list is rebuilt. Approved progressions stay with their history.
            migrationBuilder.Sql("DELETE FROM \"AiChangeOperations\" WHERE \"ProposalId\" IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\" WHERE \"Resource\" = 18);");
            migrationBuilder.Sql("DELETE FROM \"AiChangeProposals\" WHERE \"Id\" NOT IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\");");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17)");
        }
    }
}
