using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Number = table.Column<int>(type: "INTEGER", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    Changes = table.Column<int>(type: "INTEGER", nullable: false),
                    RestoredFromRevisionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EntityTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityTypeName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Content = table.Column<string>(type: "TEXT", maxLength: 200000, nullable: true),
                    CanonStatus = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityRevisions_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityRevisionAliases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RevisionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Value = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityRevisionAliases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityRevisionAliases_EntityRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "EntityRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityRevisionFieldValues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RevisionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldDefinitionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    FieldName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    TextValue = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    NumberValue = table.Column<double>(type: "REAL", nullable: true),
                    BooleanValue = table.Column<bool>(type: "INTEGER", nullable: true),
                    DateValue = table.Column<DateTime>(type: "TEXT", nullable: true),
                    OptionId = table.Column<Guid>(type: "TEXT", nullable: true),
                    OptionValue = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    ReferencedEntityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ReferencedEntityName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityRevisionFieldValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityRevisionFieldValues_EntityRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "EntityRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityRevisionTags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RevisionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityRevisionTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityRevisionTags_EntityRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "EntityRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisionAliases_RevisionId",
                table: "EntityRevisionAliases",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisionFieldValues_RevisionId",
                table: "EntityRevisionFieldValues",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisionTags_RevisionId",
                table: "EntityRevisionTags",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisions_EntityId_Number",
                table: "EntityRevisions",
                columns: new[] { "EntityId", "Number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EntityRevisionAliases");

            migrationBuilder.DropTable(
                name: "EntityRevisionFieldValues");

            migrationBuilder.DropTable(
                name: "EntityRevisionTags");

            migrationBuilder.DropTable(
                name: "EntityRevisions");
        }
    }
}
