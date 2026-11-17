using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCinemaSagas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CinemaSagas",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CinemaSagas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CinemaSagas_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CinemaPhases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SagaId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CinemaPhases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CinemaPhases_CinemaSagas_SagaId",
                        column: x => x.SagaId,
                        principalTable: "CinemaSagas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CinemaPhaseMemberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    PhaseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProjectId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CinemaPhaseMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CinemaPhaseMemberships_CinemaPhases_PhaseId",
                        column: x => x.PhaseId,
                        principalTable: "CinemaPhases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CinemaPhaseMemberships_CreativeProjects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "CreativeProjects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CinemaPhaseMemberships_PhaseId_SortOrder",
                table: "CinemaPhaseMemberships",
                columns: new[] { "PhaseId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CinemaPhaseMemberships_ProjectId",
                table: "CinemaPhaseMemberships",
                column: "ProjectId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CinemaPhases_SagaId_SortOrder",
                table: "CinemaPhases",
                columns: new[] { "SagaId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_CinemaSagas_UniverseId_SortOrder",
                table: "CinemaSagas",
                columns: new[] { "UniverseId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CinemaPhaseMemberships");

            migrationBuilder.DropTable(
                name: "CinemaPhases");

            migrationBuilder.DropTable(
                name: "CinemaSagas");
        }
    }
}
