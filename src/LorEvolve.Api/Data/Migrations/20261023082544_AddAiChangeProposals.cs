using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAiChangeProposals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CanPropose",
                table: "McpConnections",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "AiChangeProposals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProposedByUserId = table.Column<string>(type: "TEXT", maxLength: 450, nullable: false),
                    Source = table.Column<int>(type: "INTEGER", nullable: false),
                    McpConnectionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ClientName = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    Revision = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiChangeProposals", x => x.Id);
                    table.CheckConstraint("CK_AiChangeProposals_Source", "\"Source\" IN (0, 1)");
                    table.CheckConstraint("CK_AiChangeProposals_Status", "\"Status\" IN (0, 1, 2, 3, 4)");
                    table.ForeignKey(
                        name: "FK_AiChangeProposals_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AiChangeOperations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProposalId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Sequence = table.Column<int>(type: "INTEGER", nullable: false),
                    Key = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Resource = table.Column<int>(type: "INTEGER", nullable: false),
                    Action = table.Column<int>(type: "INTEGER", nullable: false),
                    TargetId = table.Column<Guid>(type: "TEXT", nullable: true),
                    BaseVersion = table.Column<int>(type: "INTEGER", nullable: true),
                    Before = table.Column<string>(type: "TEXT", nullable: true),
                    Proposed = table.Column<string>(type: "TEXT", nullable: false),
                    DependsOn = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    ResultId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ApprovalId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ResolvedByUserId = table.Column<string>(type: "TEXT", maxLength: 450, nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    ResolutionNote = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiChangeOperations", x => x.Id);
                    table.CheckConstraint("CK_AiChangeOperations_Action", "\"Action\" IN (0, 1, 2)");
                    table.CheckConstraint("CK_AiChangeOperations_Resource", "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6)");
                    table.CheckConstraint("CK_AiChangeOperations_Status", "\"Status\" IN (0, 1, 2)");
                    table.ForeignKey(
                        name: "FK_AiChangeOperations_AiChangeProposals_ProposalId",
                        column: x => x.ProposalId,
                        principalTable: "AiChangeProposals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeOperations_ProposalId_Key",
                table: "AiChangeOperations",
                columns: new[] { "ProposalId", "Key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeOperations_ProposalId_Sequence",
                table: "AiChangeOperations",
                columns: new[] { "ProposalId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeProposals_ProposedByUserId_Status",
                table: "AiChangeProposals",
                columns: new[] { "ProposedByUserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeProposals_UniverseId_Status_CreatedAt",
                table: "AiChangeProposals",
                columns: new[] { "UniverseId", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiChangeOperations");

            migrationBuilder.DropTable(
                name: "AiChangeProposals");

            migrationBuilder.DropColumn(
                name: "CanPropose",
                table: "McpConnections");
        }
    }
}
