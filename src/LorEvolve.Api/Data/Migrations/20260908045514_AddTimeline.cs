using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTimeline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TimelineEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    CanonStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    DateKind = table.Column<int>(type: "INTEGER", nullable: false),
                    StartYear = table.Column<int>(type: "INTEGER", nullable: true),
                    StartMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    StartDay = table.Column<int>(type: "INTEGER", nullable: true),
                    EndYear = table.Column<int>(type: "INTEGER", nullable: true),
                    EndMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    EndDay = table.Column<int>(type: "INTEGER", nullable: true),
                    EraLabel = table.Column<string>(type: "TEXT", maxLength: 60, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimelineEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TimelineEntries_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TimelineEntryLinks",
                columns: table => new
                {
                    TimelineEntryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimelineEntryLinks", x => new { x.TimelineEntryId, x.EntityId });
                    table.ForeignKey(
                        name: "FK_TimelineEntryLinks_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TimelineEntryLinks_TimelineEntries_TimelineEntryId",
                        column: x => x.TimelineEntryId,
                        principalTable: "TimelineEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_UniverseId_CanonStatus",
                table: "TimelineEntries",
                columns: new[] { "UniverseId", "CanonStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_UniverseId_DateKind_StartYear_StartMonth_StartDay",
                table: "TimelineEntries",
                columns: new[] { "UniverseId", "DateKind", "StartYear", "StartMonth", "StartDay" });

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntryLinks_EntityId",
                table: "TimelineEntryLinks",
                column: "EntityId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TimelineEntryLinks");

            migrationBuilder.DropTable(
                name: "TimelineEntries");
        }
    }
}
