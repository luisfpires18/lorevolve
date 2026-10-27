using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProfileImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProfileImages",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ThumbnailId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ThumbnailKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CropX = table.Column<double>(type: "REAL", nullable: true),
                    CropY = table.Column<double>(type: "REAL", nullable: true),
                    CropWidth = table.Column<double>(type: "REAL", nullable: true),
                    CropHeight = table.Column<double>(type: "REAL", nullable: true),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    ByteSize = table.Column<long>(type: "INTEGER", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProfileImages", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_ProfileImages_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProfileImages");
        }
    }
}
