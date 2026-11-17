using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddComicVolumeProject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "ComicCollections",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ComicCollections_ProjectId_SortOrder",
                table: "ComicCollections",
                columns: new[] { "ProjectId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ComicCollections_CreativeProjects_ProjectId",
                table: "ComicCollections",
                column: "ProjectId",
                principalTable: "CreativeProjects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ComicCollections_CreativeProjects_ProjectId",
                table: "ComicCollections");

            migrationBuilder.DropIndex(
                name: "IX_ComicCollections_ProjectId_SortOrder",
                table: "ComicCollections");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "ComicCollections");
        }
    }
}
