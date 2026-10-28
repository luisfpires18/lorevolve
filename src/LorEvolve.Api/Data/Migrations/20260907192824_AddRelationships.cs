using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRelationships : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RelationshipTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    InverseName = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    IsSymmetric = table.Column<bool>(type: "INTEGER", nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RelationshipTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RelationshipTypes_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Relationships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    RelationshipTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SourceEntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    TargetEntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CanonStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    StartDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    EndDate = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Relationships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Relationships_Entities_SourceEntityId",
                        column: x => x.SourceEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Relationships_Entities_TargetEntityId",
                        column: x => x.TargetEntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Relationships_RelationshipTypes_RelationshipTypeId",
                        column: x => x.RelationshipTypeId,
                        principalTable: "RelationshipTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Relationships_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipTypes_UniverseId_DisplayOrder",
                table: "RelationshipTypes",
                columns: new[] { "UniverseId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_RelationshipTypes_UniverseId_Name",
                table: "RelationshipTypes",
                columns: new[] { "UniverseId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_RelationshipTypeId",
                table: "Relationships",
                column: "RelationshipTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_SourceEntityId",
                table: "Relationships",
                column: "SourceEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_TargetEntityId",
                table: "Relationships",
                column: "TargetEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_UniverseId_SourceEntityId",
                table: "Relationships",
                columns: new[] { "UniverseId", "SourceEntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_Relationships_UniverseId_TargetEntityId",
                table: "Relationships",
                columns: new[] { "UniverseId", "TargetEntityId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Relationships");

            migrationBuilder.DropTable(
                name: "RelationshipTypes");
        }
    }
}
