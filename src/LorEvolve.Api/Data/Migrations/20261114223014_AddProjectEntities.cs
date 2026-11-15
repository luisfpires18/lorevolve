using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CanonEntityId",
                table: "Entities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "Entities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Entities_CanonEntityId",
                table: "Entities",
                column: "CanonEntityId",
                filter: "\"CanonEntityId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_ProjectId_DeletedAt_UpdatedAt",
                table: "Entities",
                columns: new[] { "ProjectId", "DeletedAt", "UpdatedAt" },
                filter: "\"ProjectId\" IS NOT NULL");

            // CanonEntityId is not a foreign key, because SQLite would add one only by rebuilding "Entities" and a
            // rebuild drops this table's EntitySearchIndex_EntityDeleted trigger silently (the same reasoning keeps
            // EntityType.ParentId out of a foreign key). The rule it would have enforced is enforced here instead, and
            // this way it says why in the error: a lore entry a project's entry still stands for is not deleted out
            // from under it. The API refuses it first with a message naming the project; this is the floor under that.
            migrationBuilder.Sql("""
                CREATE TRIGGER Entities_CanonLinkKeepsEntry_Delete BEFORE DELETE ON Entities
                WHEN EXISTS (SELECT 1 FROM Entities AS linked WHERE linked.CanonEntityId = old.Id)
                BEGIN
                    SELECT RAISE(ABORT, 'a lore entry a project entry stands for cannot be deleted');
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS Entities_CanonLinkKeepsEntry_Delete;");

            migrationBuilder.DropIndex(
                name: "IX_Entities_CanonEntityId",
                table: "Entities");

            migrationBuilder.DropIndex(
                name: "IX_Entities_ProjectId_DeletedAt_UpdatedAt",
                table: "Entities");

            // Not EF's DropColumn, which drops a SQLite column by rebuilding the table. "Entities" carries
            // EntitySearchIndex_EntityDeleted, and a rebuild would drop it, leaving every later deletion behind a
            // stale search row with nothing failing to say so. SQLite drops a column outright since 3.35, and 3.50
            // runs here. The trigger above goes first, because SQLite refuses to drop a column a trigger mentions.
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "CanonEntityId";""");
            migrationBuilder.Sql("""ALTER TABLE "Entities" DROP COLUMN "ProjectId";""");
        }
    }
}
