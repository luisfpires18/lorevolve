using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicVisibilityIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Stories_Visibility",
                table: "Stories",
                column: "Visibility",
                filter: "\"Visibility\" <> 0");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_Visibility",
                table: "Entities",
                column: "Visibility",
                filter: "\"Visibility\" <> 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Stories_Visibility",
                table: "Stories");

            migrationBuilder.DropIndex(
                name: "IX_Entities_Visibility",
                table: "Entities");
        }
    }
}
