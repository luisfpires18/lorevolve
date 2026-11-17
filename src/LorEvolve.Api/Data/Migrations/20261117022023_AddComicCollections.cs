using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddComicCollections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ComicCollections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 24, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComicCollections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComicCollections_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ComicCollectionEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CollectionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    NodeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComicCollectionEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComicCollectionEntries_ComicCollections_CollectionId",
                        column: x => x.CollectionId,
                        principalTable: "ComicCollections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ComicCollectionEntries_ProjectNodes_NodeId",
                        column: x => x.NodeId,
                        principalTable: "ProjectNodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ComicCollectionEntries_CollectionId_NodeId",
                table: "ComicCollectionEntries",
                columns: new[] { "CollectionId", "NodeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ComicCollectionEntries_CollectionId_SortOrder",
                table: "ComicCollectionEntries",
                columns: new[] { "CollectionId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ComicCollectionEntries_NodeId",
                table: "ComicCollectionEntries",
                column: "NodeId");

            migrationBuilder.CreateIndex(
                name: "IX_ComicCollections_UniverseId_Kind_SortOrder",
                table: "ComicCollections",
                columns: new[] { "UniverseId", "Kind", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ComicCollectionEntries");

            migrationBuilder.DropTable(
                name: "ComicCollections");
        }
    }
}
