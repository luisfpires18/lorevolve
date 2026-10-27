using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WidenAiChangeResources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Action",
                table: "AiChangeOperations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Action",
                table: "AiChangeOperations",
                sql: "\"Action\" IN (0, 1, 2, 3)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Action",
                table: "AiChangeOperations");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Action",
                table: "AiChangeOperations",
                sql: "\"Action\" IN (0, 1, 2)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6)");
        }
    }
}
