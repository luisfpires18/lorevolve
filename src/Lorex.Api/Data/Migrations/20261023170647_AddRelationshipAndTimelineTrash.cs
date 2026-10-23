using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRelationshipAndTimelineTrash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "TimelineEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Relationships",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_UniverseId_DeletedAt",
                table: "TimelineEntries",
                columns: new[] { "UniverseId", "DeletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_UniverseId_DeletedAt",
                table: "Relationships",
                columns: new[] { "UniverseId", "DeletedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TimelineEntries_UniverseId_DeletedAt",
                table: "TimelineEntries");

            migrationBuilder.DropIndex(
                name: "IX_Relationships_UniverseId_DeletedAt",
                table: "Relationships");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "TimelineEntries");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Relationships");
        }
    }
}
