using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityImageFramingMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Zero is Crop, and every picture stored before this column is exactly that: one with
            // a recorded crop was cut from that square, and one without was cut from the centred
            // square - which is what Crop with no crop still means. Nothing needs backfilling.
            migrationBuilder.AddColumn<int>(
                name: "Framing",
                table: "EntityImages",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // A fitted picture loses the fact that it was fitted and reads as the centred square
            // until it is framed again. Its thumbnail object is untouched, so nothing breaks.
            migrationBuilder.DropColumn(
                name: "Framing",
                table: "EntityImages");
        }
    }
}
