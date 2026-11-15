using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSemanticFindings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SemanticFindings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    RuleId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Claim = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    ConnectionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ClientName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    SubmittedByUserId = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DecisionNote = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SemanticFindings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SemanticFindings_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SemanticFindings_SystemRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SemanticFindings_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SemanticFindingCitations",
                columns: table => new
                {
                    FindingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    SourceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SourceVersion = table.Column<int>(type: "INTEGER", nullable: true),
                    RangeStart = table.Column<int>(type: "INTEGER", nullable: true),
                    RangeLength = table.Column<int>(type: "INTEGER", nullable: true),
                    Note = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SemanticFindingCitations", x => new { x.FindingId, x.SortOrder });
                    table.ForeignKey(
                        name: "FK_SemanticFindingCitations_SemanticFindings_FindingId",
                        column: x => x.FindingId,
                        principalTable: "SemanticFindings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SemanticFindings_ProjectId",
                table: "SemanticFindings",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_SemanticFindings_RuleId",
                table: "SemanticFindings",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_SemanticFindings_UniverseId_ProjectId",
                table: "SemanticFindings",
                columns: new[] { "UniverseId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_SemanticFindings_UniverseId_Status_CreatedAt",
                table: "SemanticFindings",
                columns: new[] { "UniverseId", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SemanticFindingCitations");

            migrationBuilder.DropTable(
                name: "SemanticFindings");
        }
    }
}
