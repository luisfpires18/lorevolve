using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSuggestedChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SuggestedChanges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: true),
                    BaseVersion = table.Column<int>(type: "INTEGER", nullable: false),
                    Before = table.Column<string>(type: "TEXT", nullable: false),
                    Proposed = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false),
                    ProposedByUserId = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ResolvedByUserId = table.Column<string>(type: "TEXT", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SuggestedChanges", x => x.Id);
                    table.CheckConstraint("CK_SuggestedChanges_Status", "\"Status\" IN (0, 1, 2)");
                    table.CheckConstraint("CK_SuggestedChanges_Target", "(\"EntityId\" IS NOT NULL) + (\"StoryId\" IS NOT NULL) + (\"SceneId\" IS NOT NULL) = 1");
                    table.ForeignKey(
                        name: "FK_SuggestedChanges_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SuggestedChanges_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SuggestedChanges_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SuggestedChanges_EntityId",
                table: "SuggestedChanges",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_SuggestedChanges_SceneId",
                table: "SuggestedChanges",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_SuggestedChanges_StoryId",
                table: "SuggestedChanges",
                column: "StoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SuggestedChanges");
        }
    }
}
