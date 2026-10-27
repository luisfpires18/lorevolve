using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityFormsAndAbilities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityAbilities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    UnlockEntityEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UnlockSceneId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UnlockTimelineEntryId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAbilities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityAbilities_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAbilities_EntityEras_UnlockEntityEraId",
                        column: x => x.UnlockEntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityAbilities_Scenes_UnlockSceneId",
                        column: x => x.UnlockSceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityAbilities_TimelineEntries_UnlockTimelineEntryId",
                        column: x => x.UnlockTimelineEntryId,
                        principalTable: "TimelineEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "EntityForms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    UnlockEntityEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UnlockSceneId = table.Column<Guid>(type: "TEXT", nullable: true),
                    UnlockTimelineEntryId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityForms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityForms_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityForms_EntityEras_UnlockEntityEraId",
                        column: x => x.UnlockEntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityForms_Scenes_UnlockSceneId",
                        column: x => x.UnlockSceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityForms_TimelineEntries_UnlockTimelineEntryId",
                        column: x => x.UnlockTimelineEntryId,
                        principalTable: "TimelineEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "EntityAbilityEras",
                columns: table => new
                {
                    EntityAbilityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAbilityEras", x => new { x.EntityAbilityId, x.EntityEraId });
                    table.ForeignKey(
                        name: "FK_EntityAbilityEras_EntityAbilities_EntityAbilityId",
                        column: x => x.EntityAbilityId,
                        principalTable: "EntityAbilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAbilityEras_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAbilityScenes",
                columns: table => new
                {
                    EntityAbilityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAbilityScenes", x => new { x.EntityAbilityId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_EntityAbilityScenes_EntityAbilities_EntityAbilityId",
                        column: x => x.EntityAbilityId,
                        principalTable: "EntityAbilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAbilityScenes_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAbilityForms",
                columns: table => new
                {
                    EntityAbilityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityFormId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAbilityForms", x => new { x.EntityAbilityId, x.EntityFormId });
                    table.ForeignKey(
                        name: "FK_EntityAbilityForms_EntityAbilities_EntityAbilityId",
                        column: x => x.EntityAbilityId,
                        principalTable: "EntityAbilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAbilityForms_EntityForms_EntityFormId",
                        column: x => x.EntityFormId,
                        principalTable: "EntityForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityFormEras",
                columns: table => new
                {
                    EntityFormId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFormEras", x => new { x.EntityFormId, x.EntityEraId });
                    table.ForeignKey(
                        name: "FK_EntityFormEras_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityFormEras_EntityForms_EntityFormId",
                        column: x => x.EntityFormId,
                        principalTable: "EntityForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityFormScenes",
                columns: table => new
                {
                    EntityFormId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFormScenes", x => new { x.EntityFormId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_EntityFormScenes_EntityForms_EntityFormId",
                        column: x => x.EntityFormId,
                        principalTable: "EntityForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityFormScenes_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilities_EntityId_SortOrder",
                table: "EntityAbilities",
                columns: new[] { "EntityId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilities_UnlockEntityEraId",
                table: "EntityAbilities",
                column: "UnlockEntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilities_UnlockSceneId",
                table: "EntityAbilities",
                column: "UnlockSceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilities_UnlockTimelineEntryId",
                table: "EntityAbilities",
                column: "UnlockTimelineEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilityEras_EntityEraId",
                table: "EntityAbilityEras",
                column: "EntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilityForms_EntityFormId",
                table: "EntityAbilityForms",
                column: "EntityFormId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAbilityScenes_SceneId",
                table: "EntityAbilityScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFormEras_EntityEraId",
                table: "EntityFormEras",
                column: "EntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFormScenes_SceneId",
                table: "EntityFormScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityForms_EntityId_SortOrder",
                table: "EntityForms",
                columns: new[] { "EntityId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityForms_UnlockEntityEraId",
                table: "EntityForms",
                column: "UnlockEntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityForms_UnlockSceneId",
                table: "EntityForms",
                column: "UnlockSceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityForms_UnlockTimelineEntryId",
                table: "EntityForms",
                column: "UnlockTimelineEntryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EntityAbilityEras");

            migrationBuilder.DropTable(
                name: "EntityAbilityForms");

            migrationBuilder.DropTable(
                name: "EntityAbilityScenes");

            migrationBuilder.DropTable(
                name: "EntityFormEras");

            migrationBuilder.DropTable(
                name: "EntityFormScenes");

            migrationBuilder.DropTable(
                name: "EntityAbilities");

            migrationBuilder.DropTable(
                name: "EntityForms");
        }
    }
}
