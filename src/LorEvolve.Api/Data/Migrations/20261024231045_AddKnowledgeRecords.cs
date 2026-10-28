using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddKnowledgeRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "KnowledgeRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    KnowerEntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SubjectEntityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Statement = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: true),
                    KnownFromStart = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KnowledgeRecords", x => x.Id);
                    table.CheckConstraint("CK_KnowledgeRecords_Anchor", "(\"SceneId\" IS NOT NULL) + \"KnownFromStart\" = 1");
                    table.ForeignKey(
                        name: "FK_KnowledgeRecords_Entities_KnowerEntityId",
                        column: x => x.KnowerEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KnowledgeRecords_Entities_SubjectEntityId",
                        column: x => x.SubjectEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_KnowledgeRecords_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KnowledgeRecords_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeRecords_KnowerEntityId",
                table: "KnowledgeRecords",
                column: "KnowerEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeRecords_SceneId",
                table: "KnowledgeRecords",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeRecords_SubjectEntityId",
                table: "KnowledgeRecords",
                column: "SubjectEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_KnowledgeRecords_UniverseId",
                table: "KnowledgeRecords",
                column: "UniverseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "KnowledgeRecords");
        }
    }
}
