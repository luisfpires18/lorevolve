using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCanonIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CanonConflicts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RuleCode = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Severity = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    Fingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Explanation = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CanonConflicts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CanonConflicts_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CanonConflictSubjects",
                columns: table => new
                {
                    ConflictId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SubjectKind = table.Column<int>(type: "INTEGER", nullable: false),
                    SubjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CanonConflictSubjects", x => new { x.ConflictId, x.SubjectKind, x.SubjectId, x.Role });
                    table.ForeignKey(
                        name: "FK_CanonConflictSubjects_CanonConflicts_ConflictId",
                        column: x => x.ConflictId,
                        principalTable: "CanonConflicts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CanonConflictSubjects_SubjectKind_SubjectId",
                table: "CanonConflictSubjects",
                columns: new[] { "SubjectKind", "SubjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_CanonConflicts_UniverseId_Fingerprint",
                table: "CanonConflicts",
                columns: new[] { "UniverseId", "Fingerprint" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CanonConflicts_UniverseId_Status_Severity",
                table: "CanonConflicts",
                columns: new[] { "UniverseId", "Status", "Severity" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CanonConflictSubjects");

            migrationBuilder.DropTable(
                name: "CanonConflicts");
        }
    }
}
