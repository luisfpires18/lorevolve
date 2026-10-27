using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIdeaBoards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "IdeaBoards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OwnerId = table.Column<string>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaBoards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IdeaBoards_AspNetUsers_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaBoards_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "IdeaBoardCards",
                columns: table => new
                {
                    BoardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<int>(type: "INTEGER", nullable: false),
                    X = table.Column<double>(type: "REAL", nullable: false),
                    Y = table.Column<double>(type: "REAL", nullable: false),
                    Width = table.Column<double>(type: "REAL", nullable: false),
                    Height = table.Column<double>(type: "REAL", nullable: false),
                    Z = table.Column<int>(type: "INTEGER", nullable: false),
                    Text = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    IdeaId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaBoardCards", x => new { x.BoardId, x.Id });
                    table.CheckConstraint("CK_IdeaBoardCards_Payload", "(\"Kind\" = 0 AND \"Text\" IS NOT NULL AND \"IdeaId\" IS NULL AND \"EntityId\" IS NULL) OR (\"Kind\" = 1 AND \"Text\" IS NULL AND \"IdeaId\" IS NOT NULL AND \"EntityId\" IS NULL) OR (\"Kind\" = 2 AND \"Text\" IS NULL AND \"IdeaId\" IS NULL AND \"EntityId\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_IdeaBoardCards_Entities_EntityId",
                        column: x => x.EntityId,
                        principalTable: "Entities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaBoardCards_IdeaBoards_BoardId",
                        column: x => x.BoardId,
                        principalTable: "IdeaBoards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaBoardCards_Ideas_IdeaId",
                        column: x => x.IdeaId,
                        principalTable: "Ideas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdeaBoardConnections",
                columns: table => new
                {
                    BoardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    FromCardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ToCardId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 80, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdeaBoardConnections", x => new { x.BoardId, x.Id });
                    table.ForeignKey(
                        name: "FK_IdeaBoardConnections_IdeaBoardCards_BoardId_FromCardId",
                        columns: x => new { x.BoardId, x.FromCardId },
                        principalTable: "IdeaBoardCards",
                        principalColumns: new[] { "BoardId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_IdeaBoardConnections_IdeaBoardCards_BoardId_ToCardId",
                        columns: x => new { x.BoardId, x.ToCardId },
                        principalTable: "IdeaBoardCards",
                        principalColumns: new[] { "BoardId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoardCards_EntityId",
                table: "IdeaBoardCards",
                column: "EntityId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoardCards_IdeaId",
                table: "IdeaBoardCards",
                column: "IdeaId");

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoardConnections_BoardId_FromCardId",
                table: "IdeaBoardConnections",
                columns: new[] { "BoardId", "FromCardId" });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoardConnections_BoardId_ToCardId",
                table: "IdeaBoardConnections",
                columns: new[] { "BoardId", "ToCardId" });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoards_OwnerId_DeletedAt_UpdatedAt",
                table: "IdeaBoards",
                columns: new[] { "OwnerId", "DeletedAt", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_IdeaBoards_UniverseId_DeletedAt_UpdatedAt",
                table: "IdeaBoards",
                columns: new[] { "UniverseId", "DeletedAt", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IdeaBoardConnections");

            migrationBuilder.DropTable(
                name: "IdeaBoardCards");

            migrationBuilder.DropTable(
                name: "IdeaBoards");
        }
    }
}
