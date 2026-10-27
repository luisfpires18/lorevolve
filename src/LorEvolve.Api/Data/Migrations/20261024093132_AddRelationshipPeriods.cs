using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRelationshipPeriods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RelationshipPeriods",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RelationshipId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StartEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StartYear = table.Column<int>(type: "INTEGER", nullable: true),
                    StartMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    StartMonthId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StartDay = table.Column<int>(type: "INTEGER", nullable: true),
                    EndEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EndYear = table.Column<int>(type: "INTEGER", nullable: true),
                    EndMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    EndMonthId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EndDay = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RelationshipPeriods", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_ChronologyCalendarMonths_EndMonthId",
                        column: x => x.EndMonthId,
                        principalTable: "ChronologyCalendarMonths",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_ChronologyCalendarMonths_StartMonthId",
                        column: x => x.StartMonthId,
                        principalTable: "ChronologyCalendarMonths",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_ChronologyEras_EndEraId",
                        column: x => x.EndEraId,
                        principalTable: "ChronologyEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_ChronologyEras_StartEraId",
                        column: x => x.StartEraId,
                        principalTable: "ChronologyEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RelationshipPeriods_Relationships_RelationshipId",
                        column: x => x.RelationshipId,
                        principalTable: "Relationships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_EndEraId",
                table: "RelationshipPeriods",
                column: "EndEraId");

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_EndMonthId",
                table: "RelationshipPeriods",
                column: "EndMonthId");

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_EntityEraId",
                table: "RelationshipPeriods",
                column: "EntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_RelationshipId_SortOrder",
                table: "RelationshipPeriods",
                columns: new[] { "RelationshipId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_StartEraId",
                table: "RelationshipPeriods",
                column: "StartEraId");

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipPeriods_StartMonthId",
                table: "RelationshipPeriods",
                column: "StartMonthId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RelationshipPeriods");
        }
    }
}
