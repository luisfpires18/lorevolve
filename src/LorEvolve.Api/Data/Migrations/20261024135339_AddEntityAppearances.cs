using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityAppearances : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityAppearances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAppearances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityAppearances_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAppearanceEras",
                columns: table => new
                {
                    EntityAppearanceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityEraId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAppearanceEras", x => new { x.EntityAppearanceId, x.EntityEraId });
                    table.ForeignKey(
                        name: "FK_EntityAppearanceEras_EntityAppearances_EntityAppearanceId",
                        column: x => x.EntityAppearanceId,
                        principalTable: "EntityAppearances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAppearanceEras_EntityEras_EntityEraId",
                        column: x => x.EntityEraId,
                        principalTable: "EntityEras",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAppearanceForms",
                columns: table => new
                {
                    EntityAppearanceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityFormId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAppearanceForms", x => new { x.EntityAppearanceId, x.EntityFormId });
                    table.ForeignKey(
                        name: "FK_EntityAppearanceForms_EntityAppearances_EntityAppearanceId",
                        column: x => x.EntityAppearanceId,
                        principalTable: "EntityAppearances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAppearanceForms_EntityForms_EntityFormId",
                        column: x => x.EntityFormId,
                        principalTable: "EntityForms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAppearanceImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityAppearanceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ThumbnailKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    ByteSize = table.Column<long>(type: "INTEGER", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAppearanceImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityAppearanceImages_EntityAppearances_EntityAppearanceId",
                        column: x => x.EntityAppearanceId,
                        principalTable: "EntityAppearances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAppearanceScenes",
                columns: table => new
                {
                    EntityAppearanceId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SceneId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAppearanceScenes", x => new { x.EntityAppearanceId, x.SceneId });
                    table.ForeignKey(
                        name: "FK_EntityAppearanceScenes_EntityAppearances_EntityAppearanceId",
                        column: x => x.EntityAppearanceId,
                        principalTable: "EntityAppearances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityAppearanceScenes_Scenes_SceneId",
                        column: x => x.SceneId,
                        principalTable: "Scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityAppearanceEras_EntityEraId",
                table: "EntityAppearanceEras",
                column: "EntityEraId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAppearanceForms_EntityFormId",
                table: "EntityAppearanceForms",
                column: "EntityFormId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAppearanceImages_EntityAppearanceId_SortOrder",
                table: "EntityAppearanceImages",
                columns: new[] { "EntityAppearanceId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityAppearanceScenes_SceneId",
                table: "EntityAppearanceScenes",
                column: "SceneId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityAppearances_EntityId_SortOrder",
                table: "EntityAppearances",
                columns: new[] { "EntityId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EntityAppearanceEras");

            migrationBuilder.DropTable(
                name: "EntityAppearanceForms");

            migrationBuilder.DropTable(
                name: "EntityAppearanceImages");

            migrationBuilder.DropTable(
                name: "EntityAppearanceScenes");

            migrationBuilder.DropTable(
                name: "EntityAppearances");
        }
    }
}
