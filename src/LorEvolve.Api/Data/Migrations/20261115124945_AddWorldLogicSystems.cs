using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWorldLogicSystems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LoreSystems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Scope = table.Column<int>(type: "INTEGER", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NormalizedName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoreSystems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LoreSystems_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LoreSystems_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Scope = table.Column<int>(type: "INTEGER", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    SchemaVersion = table.Column<int>(type: "INTEGER", nullable: true),
                    ConditionJson = table.Column<string>(type: "TEXT", maxLength: 32768, nullable: true),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SystemRules_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SystemRules_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LoreSystemRevisions",
                columns: table => new
                {
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    SavedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoreSystemRevisions", x => new { x.SystemId, x.Version });
                    table.ForeignKey(
                        name: "FK_LoreSystemRevisions_LoreSystems_SystemId",
                        column: x => x.SystemId,
                        principalTable: "LoreSystems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LoreSystemRules",
                columns: table => new
                {
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RuleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoreSystemRules", x => new { x.SystemId, x.RuleId });
                    table.ForeignKey(
                        name: "FK_LoreSystemRules_LoreSystems_SystemId",
                        column: x => x.SystemId,
                        principalTable: "LoreSystems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LoreSystemRules_SystemRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemRuleDependencies",
                columns: table => new
                {
                    RuleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DependsOnRuleId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemRuleDependencies", x => new { x.RuleId, x.DependsOnRuleId });
                    table.ForeignKey(
                        name: "FK_SystemRuleDependencies_SystemRules_DependsOnRuleId",
                        column: x => x.DependsOnRuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SystemRuleDependencies_SystemRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SystemRuleRevisions",
                columns: table => new
                {
                    RuleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    SchemaVersion = table.Column<int>(type: "INTEGER", nullable: true),
                    ConditionJson = table.Column<string>(type: "TEXT", maxLength: 32768, nullable: true),
                    SavedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemRuleRevisions", x => new { x.RuleId, x.Version });
                    table.ForeignKey(
                        name: "FK_SystemRuleRevisions_SystemRules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "SystemRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LoreSystemRules_RuleId",
                table: "LoreSystemRules",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_LoreSystems_ProjectId",
                table: "LoreSystems",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_LoreSystems_UniverseId_ProjectId_NormalizedName",
                table: "LoreSystems",
                columns: new[] { "UniverseId", "ProjectId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LoreSystems_UniverseId_UpdatedAt",
                table: "LoreSystems",
                columns: new[] { "UniverseId", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SystemRuleDependencies_DependsOnRuleId",
                table: "SystemRuleDependencies",
                column: "DependsOnRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_SystemRules_ProjectId",
                table: "SystemRules",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_SystemRules_UniverseId_UpdatedAt",
                table: "SystemRules",
                columns: new[] { "UniverseId", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LoreSystemRevisions");

            migrationBuilder.DropTable(
                name: "LoreSystemRules");

            migrationBuilder.DropTable(
                name: "SystemRuleDependencies");

            migrationBuilder.DropTable(
                name: "SystemRuleRevisions");

            migrationBuilder.DropTable(
                name: "LoreSystems");

            migrationBuilder.DropTable(
                name: "SystemRules");
        }
    }
}
