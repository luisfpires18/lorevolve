using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStoryProjectCoversAndProjectOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "CreativeProjects",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Every existing project keeps the place it was shown in: most recently updated first, per universe.
            migrationBuilder.Sql(
                """
                UPDATE "CreativeProjects" SET "SortOrder" = (
                    SELECT COUNT(*) FROM "CreativeProjects" AS "Other"
                    WHERE "Other"."UniverseId" = "CreativeProjects"."UniverseId"
                      AND ("Other"."UpdatedAt" > "CreativeProjects"."UpdatedAt"
                        OR ("Other"."UpdatedAt" = "CreativeProjects"."UpdatedAt" AND "Other"."Id" < "CreativeProjects"."Id")));
                """);

            migrationBuilder.CreateTable(
                name: "ProjectCovers",
                columns: table => new
                {
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CardKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
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
                    table.PrimaryKey("PK_ProjectCovers", x => x.ProjectId);
                    table.ForeignKey(
                        name: "FK_ProjectCovers_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StoryCovers",
                columns: table => new
                {
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    CardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CardKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
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
                    table.PrimaryKey("PK_StoryCovers", x => x.StoryId);
                    table.ForeignKey(
                        name: "FK_StoryCovers_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectCovers_UniverseId",
                table: "ProjectCovers",
                column: "UniverseId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryCovers_UniverseId",
                table: "StoryCovers",
                column: "UniverseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectCovers");

            migrationBuilder.DropTable(
                name: "StoryCovers");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "CreativeProjects");
        }
    }
}
