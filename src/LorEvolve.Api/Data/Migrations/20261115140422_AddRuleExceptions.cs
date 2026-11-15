using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRuleExceptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExceptionsJson",
                table: "SystemRules",
                type: "TEXT",
                maxLength: 524288,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExceptionsJson",
                table: "SystemRuleRevisions",
                type: "TEXT",
                maxLength: 524288,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExceptionsJson",
                table: "SystemRules");

            migrationBuilder.DropColumn(
                name: "ExceptionsJson",
                table: "SystemRuleRevisions");
        }
    }
}
