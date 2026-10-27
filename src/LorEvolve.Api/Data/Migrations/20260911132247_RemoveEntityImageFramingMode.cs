using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveEntityImageFramingMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A thumbnail is a square crop again, and only that, so the mode that chose between a
            // crop and a fit goes. Every row stays valid without it. A crop row keeps its square. A
            // row that was fitted has no crop, which reads as the centred square: that is what
            // "Edit thumbnail" opens on and what a backup regenerates. Its stored thumbnail object
            // is not rewritten here - a migration cannot reach the bucket - so it keeps showing the
            // whole picture until the author crops it again, and the original is untouched either way.
            migrationBuilder.DropColumn(
                name: "Framing",
                table: "EntityImages");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Back to every row being a crop, which is what every row written since is.
            migrationBuilder.AddColumn<int>(
                name: "Framing",
                table: "EntityImages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }
    }
}
