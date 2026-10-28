using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRuleValidation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ValidationTerms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ValidationTerms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ValidationTerms_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TimelineEntryValidations",
                columns: table => new
                {
                    TimelineEntryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EventKindTermId = table.Column<Guid>(type: "TEXT", nullable: true),
                    MethodTermId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ParticipantEntityId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TimelineEntryValidations", x => x.TimelineEntryId);
                    table.ForeignKey(
                        name: "FK_TimelineEntryValidations_Entities_ParticipantEntityId",
                        column: x => x.ParticipantEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TimelineEntryValidations_TimelineEntries_TimelineEntryId",
                        column: x => x.TimelineEntryId,
                        principalTable: "TimelineEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TimelineEntryValidations_ValidationTerms_EventKindTermId",
                        column: x => x.EventKindTermId,
                        principalTable: "ValidationTerms",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TimelineEntryValidations_ValidationTerms_MethodTermId",
                        column: x => x.MethodTermId,
                        principalTable: "ValidationTerms",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "WorldRuleValidations",
                columns: table => new
                {
                    WorldRuleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    EventKindTermId = table.Column<Guid>(type: "TEXT", nullable: false),
                    MethodTermId = table.Column<Guid>(type: "TEXT", nullable: false),
                    MaxOccurrences = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldRuleValidations", x => x.WorldRuleId);
                    table.ForeignKey(
                        name: "FK_WorldRuleValidations_ValidationTerms_EventKindTermId",
                        column: x => x.EventKindTermId,
                        principalTable: "ValidationTerms",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WorldRuleValidations_ValidationTerms_MethodTermId",
                        column: x => x.MethodTermId,
                        principalTable: "ValidationTerms",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WorldRuleValidations_WorldRules_WorldRuleId",
                        column: x => x.WorldRuleId,
                        principalTable: "WorldRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntryValidations_EventKindTermId",
                table: "TimelineEntryValidations",
                column: "EventKindTermId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntryValidations_MethodTermId",
                table: "TimelineEntryValidations",
                column: "MethodTermId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntryValidations_ParticipantEntityId",
                table: "TimelineEntryValidations",
                column: "ParticipantEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_ValidationTerms_UniverseId_Kind_NormalizedName",
                table: "ValidationTerms",
                columns: new[] { "UniverseId", "Kind", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorldRuleValidations_EventKindTermId",
                table: "WorldRuleValidations",
                column: "EventKindTermId");

            migrationBuilder.CreateIndex(
                name: "IX_WorldRuleValidations_MethodTermId",
                table: "WorldRuleValidations",
                column: "MethodTermId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TimelineEntryValidations");

            migrationBuilder.DropTable(
                name: "WorldRuleValidations");

            migrationBuilder.DropTable(
                name: "ValidationTerms");
        }
    }
}
