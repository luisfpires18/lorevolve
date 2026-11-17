using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Machine findings (#360, ADR 0073): <c>WorldLogicFindings.RuleId</c> becomes nullable, and the new table
    /// <c>WorldLogicFindingMachines</c> names the System, state and subject of a finding that has no rule.
    ///
    /// <para>The findings table holds the author's dismissals and their history, so it is migrated, never dropped as
    /// data. SQLite cannot relax <c>NOT NULL</c> in place, so the generator rebuilds it through
    /// <c>ef_temp_WorldLogicFindings</c> once each way, with foreign keys off for the rebuild, and every row, with its
    /// evidence and events, comes through unchanged. <c>WorldLogicFindingMachineMigrationTests</c> proves it with a
    /// dismissed finding in the table.</para>
    ///
    /// <para><b>Written by hand in Down:</b> the machine findings, with their evidence and events, are deleted before
    /// the rebuild, because a finding with no rule cannot fit <c>NOT NULL</c>. The generated default of the empty Guid
    /// is removed, as in <c>RequireProjectUniverse</c>: a rollback must never point a finding at a rule that does not
    /// exist. Rolling back loses machine findings and their dismissals; rule findings are untouched.</para>
    /// </summary>
    public partial class AddMachineFindings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "RuleId",
                table: "WorldLogicFindings",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.CreateTable(
                name: "WorldLogicFindingMachines",
                columns: table => new
                {
                    FindingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SystemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Check = table.Column<int>(type: "INTEGER", nullable: false),
                    StateId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SubjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldLogicFindingMachines", x => x.FindingId);
                    table.ForeignKey(
                        name: "FK_WorldLogicFindingMachines_LoreSystems_SystemId",
                        column: x => x.SystemId,
                        principalTable: "LoreSystems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorldLogicFindingMachines_WorldLogicFindings_FindingId",
                        column: x => x.FindingId,
                        principalTable: "WorldLogicFindings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorldLogicFindingMachines_SystemId",
                table: "WorldLogicFindingMachines",
                column: "SystemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // By hand, before the rebuild: a machine finding has no rule and cannot fit NOT NULL.
            migrationBuilder.Sql(
                """
                DELETE FROM "WorldLogicFindingEvidence"
                WHERE "FindingId" IN (SELECT "Id" FROM "WorldLogicFindings" WHERE "RuleId" IS NULL);
                """);
            migrationBuilder.Sql(
                """
                DELETE FROM "WorldLogicFindingEvents"
                WHERE "FindingId" IN (SELECT "Id" FROM "WorldLogicFindings" WHERE "RuleId" IS NULL);
                """);
            migrationBuilder.Sql(
                """
                DELETE FROM "WorldLogicFindings" WHERE "RuleId" IS NULL;
                """);

            migrationBuilder.DropTable(
                name: "WorldLogicFindingMachines");

            migrationBuilder.AlterColumn<Guid>(
                name: "RuleId",
                table: "WorldLogicFindings",
                type: "TEXT",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);
        }
    }
}
