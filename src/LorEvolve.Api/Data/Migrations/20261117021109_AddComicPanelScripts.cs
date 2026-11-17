using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddComicPanelScripts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Caption",
                table: "ProjectNodes",
                type: "TEXT",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dialogue",
                table: "ProjectNodes",
                type: "TEXT",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "ProjectNodes",
                type: "TEXT",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Sfx",
                table: "ProjectNodes",
                type: "TEXT",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectNodeImages",
                columns: table => new
                {
                    NodeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CropId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CropKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CropX = table.Column<double>(type: "REAL", nullable: false),
                    CropY = table.Column<double>(type: "REAL", nullable: false),
                    CropWidth = table.Column<double>(type: "REAL", nullable: false),
                    CropHeight = table.Column<double>(type: "REAL", nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    ByteSize = table.Column<long>(type: "INTEGER", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectNodeImages", x => x.NodeId);
                    table.ForeignKey(
                        name: "FK_ProjectNodeImages_ProjectNodes_NodeId",
                        column: x => x.NodeId,
                        principalTable: "ProjectNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectNodeImages");

            migrationBuilder.DropColumn(
                name: "Caption",
                table: "ProjectNodes");

            migrationBuilder.DropColumn(
                name: "Dialogue",
                table: "ProjectNodes");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "ProjectNodes");

            migrationBuilder.DropColumn(
                name: "Sfx",
                table: "ProjectNodes");
        }
    }
}
