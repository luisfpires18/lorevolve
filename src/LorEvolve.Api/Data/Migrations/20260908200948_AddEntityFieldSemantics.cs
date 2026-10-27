using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityFieldSemantics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Semantic",
                table: "EntityFieldDefinitions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldDefinitions_EntityTypeId_Semantic",
                table: "EntityFieldDefinitions",
                columns: new[] { "EntityTypeId", "Semantic" },
                unique: true,
                filter: "\"Semantic\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EntityFieldDefinitions_EntityTypeId_Semantic",
                table: "EntityFieldDefinitions");

            migrationBuilder.DropColumn(
                name: "Semantic",
                table: "EntityFieldDefinitions");
        }
    }
}
