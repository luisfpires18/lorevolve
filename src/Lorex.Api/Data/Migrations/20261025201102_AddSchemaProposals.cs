using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSchemaProposals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddColumn<bool>(
                name: "CanProposeSchema",
                table: "McpConnections",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Proposals are review state, never content (ADR 0047): one holding a schema change can't be kept under the
            // narrower list, so it goes - with its changes - before the list does. Approved changes already live in the schema.
            migrationBuilder.Sql("DELETE FROM \"AiChangeOperations\" WHERE \"ProposalId\" IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\" WHERE \"Resource\" IN (12, 13, 14));");
            migrationBuilder.Sql("DELETE FROM \"AiChangeProposals\" WHERE \"Id\" NOT IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\");");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.DropColumn(
                name: "CanProposeSchema",
                table: "McpConnections");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)");
        }
    }
}
