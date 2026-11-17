using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSystemMachines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SystemMachines",
                columns: table => new
                {
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SubjectType = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Attribute = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    SchemaVersion = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemMachines", x => x.SystemId);
                    table.ForeignKey(
                        name: "FK_SystemMachines_LoreSystems_SystemId",
                        column: x => x.SystemId,
                        principalTable: "LoreSystems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemStates",
                columns: table => new
                {
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    IsInitial = table.Column<bool>(type: "INTEGER", nullable: false),
                    X = table.Column<double>(type: "REAL", nullable: false),
                    Y = table.Column<double>(type: "REAL", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemStates", x => new { x.SystemId, x.Id });
                    table.ForeignKey(
                        name: "FK_SystemStates_SystemMachines_SystemId",
                        column: x => x.SystemId,
                        principalTable: "SystemMachines",
                        principalColumn: "SystemId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemTransitions",
                columns: table => new
                {
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FromStateId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ToStateId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    GuardRuleId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemTransitions", x => new { x.SystemId, x.Id });
                    table.ForeignKey(
                        name: "FK_SystemTransitions_SystemRules_GuardRuleId",
                        column: x => x.GuardRuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SystemTransitions_SystemStates_SystemId_FromStateId",
                        columns: x => new { x.SystemId, x.FromStateId },
                        principalTable: "SystemStates",
                        principalColumns: new[] { "SystemId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SystemTransitions_SystemStates_SystemId_ToStateId",
                        columns: x => new { x.SystemId, x.ToStateId },
                        principalTable: "SystemStates",
                        principalColumns: new[] { "SystemId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SystemTransitions_GuardRuleId",
                table: "SystemTransitions",
                column: "GuardRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_SystemTransitions_SystemId_FromStateId",
                table: "SystemTransitions",
                columns: new[] { "SystemId", "FromStateId" });

            migrationBuilder.CreateIndex(
                name: "IX_SystemTransitions_SystemId_ToStateId",
                table: "SystemTransitions",
                columns: new[] { "SystemId", "ToStateId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SystemTransitions");

            migrationBuilder.DropTable(
                name: "SystemStates");

            migrationBuilder.DropTable(
                name: "SystemMachines");
        }
    }
}
