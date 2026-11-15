using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWorldLogicFindings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorldLogicFindings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RuleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Outcome = table.Column<int>(type: "INTEGER", nullable: false),
                    ErrorCode = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    RuleVersion = table.Column<int>(type: "INTEGER", nullable: false),
                    SchemaVersion = table.Column<int>(type: "INTEGER", nullable: false),
                    Fingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    Rationale = table.Column<string>(type: "TEXT", maxLength: 8000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldLogicFindings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorldLogicFindings_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorldLogicFindings_SystemRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorldLogicFindingEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FindingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Action = table.Column<int>(type: "INTEGER", nullable: false),
                    ActorId = table.Column<string>(type: "TEXT", maxLength: 450, nullable: true),
                    Note = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    At = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldLogicFindingEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorldLogicFindingEvents_WorldLogicFindings_FindingId",
                        column: x => x.FindingId,
                        principalTable: "WorldLogicFindings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorldLogicFindingEvidence",
                columns: table => new
                {
                    FindingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    SourceRowId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldLogicFindingEvidence", x => new { x.FindingId, x.SortOrder });
                    table.ForeignKey(
                        name: "FK_WorldLogicFindingEvidence_WorldLogicFindings_FindingId",
                        column: x => x.FindingId,
                        principalTable: "WorldLogicFindings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindingEvents_FindingId_At",
                table: "WorldLogicFindingEvents",
                columns: new[] { "FindingId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindings_ProjectId",
                table: "WorldLogicFindings",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindings_RuleId",
                table: "WorldLogicFindings",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindings_UniverseId_Fingerprint",
                table: "WorldLogicFindings",
                columns: new[] { "UniverseId", "Fingerprint" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindings_UniverseId_ProjectId",
                table: "WorldLogicFindings",
                columns: new[] { "UniverseId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindings_UniverseId_Status_Outcome",
                table: "WorldLogicFindings",
                columns: new[] { "UniverseId", "Status", "Outcome" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorldLogicFindingEvents");

            migrationBuilder.DropTable(
                name: "WorldLogicFindingEvidence");

            migrationBuilder.DropTable(
                name: "WorldLogicFindings");
        }
    }
}
