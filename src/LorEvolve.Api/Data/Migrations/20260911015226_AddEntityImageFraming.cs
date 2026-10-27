using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityImageFraming : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "CropHeight",
                table: "EntityImages",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "CropWidth",
                table: "EntityImages",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "CropX",
                table: "EntityImages",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "CropY",
                table: "EntityImages",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ThumbnailId",
                table: "EntityImages",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // A picture stored before this migration keeps its thumbnail at the key it was
            // written under, and needs a thumbnail id that is its own rather than the empty guid
            // every such row would otherwise share. Its asset id is exactly that: unique, and
            // already the identity of the pair. Its crop stays null, which means the centred
            // square that thumbnail really was cut with.
            migrationBuilder.Sql("""UPDATE "EntityImages" SET "ThumbnailId" = "AssetId";""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CropHeight",
                table: "EntityImages");

            migrationBuilder.DropColumn(
                name: "CropWidth",
                table: "EntityImages");

            migrationBuilder.DropColumn(
                name: "CropX",
                table: "EntityImages");

            migrationBuilder.DropColumn(
                name: "CropY",
                table: "EntityImages");

            migrationBuilder.DropColumn(
                name: "ThumbnailId",
                table: "EntityImages");
        }
    }
}
