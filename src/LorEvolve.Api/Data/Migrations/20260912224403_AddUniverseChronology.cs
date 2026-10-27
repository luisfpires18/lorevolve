using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddUniverseChronology : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "EndEraId",
                table: "TimelineEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StartEraId",
                table: "TimelineEntries",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EraId",
                table: "EntityRevisionFieldValues",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EraLabel",
                table: "EntityRevisionFieldValues",
                type: "TEXT",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EraId",
                table: "EntityFieldValues",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ChronologyEras",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    Abbreviation = table.Column<string>(type: "TEXT", maxLength: 12, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Direction = table.Column<int>(type: "INTEGER", nullable: false),
                    LabelPosition = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChronologyEras", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChronologyEras_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_EndEraId",
                table: "TimelineEntries",
                column: "EndEraId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_StartEraId",
                table: "TimelineEntries",
                column: "StartEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldValues_EraId",
                table: "EntityFieldValues",
                column: "EraId");

            migrationBuilder.CreateIndex(
                name: "IX_ChronologyEras_UniverseId_SortOrder",
                table: "ChronologyEras",
                columns: new[] { "UniverseId", "SortOrder" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_EntityFieldValues_ChronologyEras_EraId",
                table: "EntityFieldValues",
                column: "EraId",
                principalTable: "ChronologyEras",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_TimelineEntries_ChronologyEras_EndEraId",
                table: "TimelineEntries",
                column: "EndEraId",
                principalTable: "ChronologyEras",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_TimelineEntries_ChronologyEras_StartEraId",
                table: "TimelineEntries",
                column: "StartEraId",
                principalTable: "ChronologyEras",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The generator drops ChronologyEras before it rebuilds the tables that point at it,
            // and with foreign keys on SQLite refuses to drop a table rows still reference. So the
            // references go first. Rolling back discards the eras themselves regardless: a year
            // written in one reads as a plain year again, which is the only meaning the previous
            // schema has for it.
            migrationBuilder.Sql("""UPDATE "TimelineEntries" SET "StartEraId" = NULL, "EndEraId" = NULL;""");
            migrationBuilder.Sql("""UPDATE "EntityFieldValues" SET "EraId" = NULL;""");

            migrationBuilder.DropForeignKey(
                name: "FK_EntityFieldValues_ChronologyEras_EraId",
                table: "EntityFieldValues");

            migrationBuilder.DropForeignKey(
                name: "FK_TimelineEntries_ChronologyEras_EndEraId",
                table: "TimelineEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_TimelineEntries_ChronologyEras_StartEraId",
                table: "TimelineEntries");

            migrationBuilder.DropTable(
                name: "ChronologyEras");

            migrationBuilder.DropIndex(
                name: "IX_TimelineEntries_EndEraId",
                table: "TimelineEntries");

            migrationBuilder.DropIndex(
                name: "IX_TimelineEntries_StartEraId",
                table: "TimelineEntries");

            migrationBuilder.DropIndex(
                name: "IX_EntityFieldValues_EraId",
                table: "EntityFieldValues");

            migrationBuilder.DropColumn(
                name: "EndEraId",
                table: "TimelineEntries");

            migrationBuilder.DropColumn(
                name: "StartEraId",
                table: "TimelineEntries");

            migrationBuilder.DropColumn(
                name: "EraId",
                table: "EntityRevisionFieldValues");

            migrationBuilder.DropColumn(
                name: "EraLabel",
                table: "EntityRevisionFieldValues");

            migrationBuilder.DropColumn(
                name: "EraId",
                table: "EntityFieldValues");
        }
    }
}
