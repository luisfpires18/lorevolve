using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRelationshipTypeCanonConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AgeOrder",
                table: "RelationshipTypes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "MaxAgeDifferenceYears",
                table: "RelationshipTypes",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinAgeDifferenceYears",
                table: "RelationshipTypes",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AgeOrder",
                table: "RelationshipTypes");

            migrationBuilder.DropColumn(
                name: "MaxAgeDifferenceYears",
                table: "RelationshipTypes");

            migrationBuilder.DropColumn(
                name: "MinAgeDifferenceYears",
                table: "RelationshipTypes");
        }
    }
}
