using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityProgression : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityEras",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    StartEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StartYear = table.Column<int>(type: "INTEGER", nullable: true),
                    StartMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    StartMonthId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StartDay = table.Column<int>(type: "INTEGER", nullable: true),
                    EndEraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EndYear = table.Column<int>(type: "INTEGER", nullable: true),
                    EndMonth = table.Column<int>(type: "INTEGER", nullable: true),
                    EndMonthId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EndDay = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityEras", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityEras_ChronologyCalendarMonths_EndMonthId",
                        column: x => x.EndMonthId,
                        principalTable: "ChronologyCalendarMonths",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEras_ChronologyCalendarMonths_StartMonthId",
                        column: x => x.StartMonthId,
                        principalTable: "ChronologyCalendarMonths",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEras_ChronologyEras_EndEraId",
                        column: x => x.EndEraId,
                        principalTable: "ChronologyEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEras_ChronologyEras_StartEraId",
                        column: x => x.StartEraId,
                        principalTable: "ChronologyEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEras_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityProgressionRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    RestoredFromRevisionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ActorUserId = table.Column<string>(type: "TEXT", nullable: true),
                    Snapshot = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityProgressionRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityProgressionRevisions_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityProgressions",
                columns: table => new
                {
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityProgressions", x => x.EntityId);
                    table.ForeignKey(
                        name: "FK_EntityProgressions_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityEraFieldValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    IsCleared = table.Column<bool>(type: "INTEGER", nullable: false),
                    TextValue = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    NumberValue = table.Column<double>(type: "REAL", nullable: true),
                    EraId = table.Column<Guid>(type: "TEXT", nullable: true),
                    BooleanValue = table.Column<bool>(type: "INTEGER", nullable: true),
                    DateValue = table.Column<DateTime>(type: "TEXT", nullable: true),
                    OptionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ReferencedEntityId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityEraFieldValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityEraFieldValues_ChronologyEras_EraId",
                        column: x => x.EraId,
                        principalTable: "ChronologyEras",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEraFieldValues_Entities_ReferencedEntityId",
                        column: x => x.ReferencedEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityEraFieldValues_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityEraFieldValues_EntityFieldDefinitions_FieldDefinitionId",
                        column: x => x.FieldDefinitionId,
                        principalTable: "EntityFieldDefinitions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EntityEraFieldValues_EntityFieldOptions_OptionId",
                        column: x => x.OptionId,
                        principalTable: "EntityFieldOptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityEraScenes",
                columns: table => new
                {
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityEraScenes", x => new { x.EntityEraId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_EntityEraScenes_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityEraScenes_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityEraStories",
                columns: table => new
                {
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoryId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityEraStories", x => new { x.EntityEraId, x.StoryId });
                    table.ForeignKey(
                        name: "FK_EntityEraStories_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityEraStories_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraFieldValues_EntityEraId_FieldDefinitionId",
                table: "EntityEraFieldValues",
                columns: new[] { "EntityEraId", "FieldDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraFieldValues_EraId",
                table: "EntityEraFieldValues",
                column: "EraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraFieldValues_FieldDefinitionId",
                table: "EntityEraFieldValues",
                column: "FieldDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraFieldValues_OptionId",
                table: "EntityEraFieldValues",
                column: "OptionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraFieldValues_ReferencedEntityId",
                table: "EntityEraFieldValues",
                column: "ReferencedEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraScenes_SceneId",
                table: "EntityEraScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEraStories_StoryId",
                table: "EntityEraStories",
                column: "StoryId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEras_EndEraId",
                table: "EntityEras",
                column: "EndEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEras_EndMonthId",
                table: "EntityEras",
                column: "EndMonthId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEras_EntityId_SortOrder",
                table: "EntityEras",
                columns: new[] { "EntityId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityEras_StartEraId",
                table: "EntityEras",
                column: "StartEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityEras_StartMonthId",
                table: "EntityEras",
                column: "StartMonthId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityProgressionRevisions_EntityId_Number",
                table: "EntityProgressionRevisions",
                columns: new[] { "EntityId", "Number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EntityEraFieldValues");

            migrationBuilder.DropTable(
                name: "EntityEraScenes");

            migrationBuilder.DropTable(
                name: "EntityEraStories");

            migrationBuilder.DropTable(
                name: "EntityProgressionRevisions");

            migrationBuilder.DropTable(
                name: "EntityProgressions");

            migrationBuilder.DropTable(
                name: "EntityEras");
        }
    }
}
