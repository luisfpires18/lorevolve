using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLoreEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Icon = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    AccentColor = table.Column<string>(type: "TEXT", maxLength: 7, nullable: true),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityTypes_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Tags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tags_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Entities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Content = table.Column<string>(type: "TEXT", maxLength: 200000, nullable: true),
                    CanonStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    IsArchived = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Entities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Entities_EntityTypes_EntityTypeId",
                        column: x => x.EntityTypeId,
                        principalTable: "EntityTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Entities_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    IsRequired = table.Column<bool>(type: "INTEGER", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    DefaultValue = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFieldDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityFieldDefinitions_EntityTypes_EntityTypeId",
                        column: x => x.EntityTypeId,
                        principalTable: "EntityTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityAliases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityAliases_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityTags",
                columns: table => new
                {
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TagId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityTags", x => new { x.EntityId, x.TagId });
                    table.ForeignKey(
                        name: "FK_EntityTags_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityTags_Tags_TagId",
                        column: x => x.TagId,
                        principalTable: "Tags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityFieldOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFieldOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityFieldOptions_EntityFieldDefinitions_FieldDefinitionId",
                        column: x => x.FieldDefinitionId,
                        principalTable: "EntityFieldDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityFieldValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TextValue = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    NumberValue = table.Column<double>(type: "REAL", nullable: true),
                    BooleanValue = table.Column<bool>(type: "INTEGER", nullable: true),
                    DateValue = table.Column<DateTime>(type: "TEXT", nullable: true),
                    OptionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ReferencedEntityId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFieldValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityFieldValues_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityFieldValues_Entities_ReferencedEntityId",
                        column: x => x.ReferencedEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_EntityFieldValues_EntityFieldDefinitions_FieldDefinitionId",
                        column: x => x.FieldDefinitionId,
                        principalTable: "EntityFieldDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EntityFieldValues_EntityFieldOptions_OptionId",
                        column: x => x.OptionId,
                        principalTable: "EntityFieldOptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Entities_EntityTypeId",
                table: "Entities",
                column: "EntityTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_EntityTypeId",
                table: "Entities",
                columns: new[] { "UniverseId", "EntityTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_IsArchived_UpdatedAt",
                table: "Entities",
                columns: new[] { "UniverseId", "IsArchived", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_Name",
                table: "Entities",
                columns: new[] { "UniverseId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityAliases_EntityId_Value",
                table: "EntityAliases",
                columns: new[] { "EntityId", "Value" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldDefinitions_EntityTypeId_Name",
                table: "EntityFieldDefinitions",
                columns: new[] { "EntityTypeId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldOptions_FieldDefinitionId_Value",
                table: "EntityFieldOptions",
                columns: new[] { "FieldDefinitionId", "Value" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldValues_EntityId_FieldDefinitionId",
                table: "EntityFieldValues",
                columns: new[] { "EntityId", "FieldDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldValues_FieldDefinitionId",
                table: "EntityFieldValues",
                column: "FieldDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldValues_OptionId",
                table: "EntityFieldValues",
                column: "OptionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldValues_ReferencedEntityId",
                table: "EntityFieldValues",
                column: "ReferencedEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTags_TagId",
                table: "EntityTags",
                column: "TagId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_UniverseId_DisplayOrder",
                table: "EntityTypes",
                columns: new[] { "UniverseId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_UniverseId_Name",
                table: "EntityTypes",
                columns: new[] { "UniverseId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tags_UniverseId_Slug",
                table: "Tags",
                columns: new[] { "UniverseId", "Slug" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EntityAliases");

            migrationBuilder.DropTable(
                name: "EntityFieldValues");

            migrationBuilder.DropTable(
                name: "EntityTags");

            migrationBuilder.DropTable(
                name: "EntityFieldOptions");

            migrationBuilder.DropTable(
                name: "Entities");

            migrationBuilder.DropTable(
                name: "Tags");

            migrationBuilder.DropTable(
                name: "EntityFieldDefinitions");

            migrationBuilder.DropTable(
                name: "EntityTypes");
        }
    }
}
