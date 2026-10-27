using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Nested types (ADR 0007 amendment, 2026-10-01). Additive only: <c>EntityTypes.ParentId</c>, null for a root, and an index
    /// on (<c>UniverseId</c>, <c>ParentId</c>) for a type's children. Every existing type becomes a root and keeps its
    /// <c>DisplayOrder</c>, so nothing reorders, and nothing is inferred from a name.
    ///
    /// No foreign key, on purpose. SQLite adds one only by rebuilding the table, and a rebuilt <c>EntityTypes</c> becomes the
    /// table SQLite visits first when a universe's delete cascades: its types would go before the entries using them, and the
    /// entries' RESTRICT key would refuse the delete - which happened, and is why this is additive like the content
    /// publication migration. The two guarantees a key would give are triggers instead:
    ///
    /// <list type="bullet">
    /// <item>a parent is a type that exists in the same universe, on every insert and on every change of parent or universe;</item>
    /// <item>a type that still has children cannot be deleted - unless its universe is gone, which is a universe's own delete
    /// cascading every type at once (SQLite runs cascades after the universe row is removed).</item>
    /// </list>
    ///
    /// A type is never its own ancestor: a trigger cannot walk a graph (SQLite allows no recursive query in one), so that is
    /// the API's and the restore's, which do. Rolling back drops the triggers, the index and then the column, with SQLite's own
    /// <c>DROP COLUMN</c>: nothing is rebuilt either way. The hierarchy is lost; every type is a root again.
    /// </summary>
    public partial class AddEntityTypeHierarchy : Migration
    {
        private const string ParentOfSameUniverse = """
            WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM EntityTypes AS parent
                WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId AND parent.Id <> NEW.Id)
            BEGIN
                SELECT RAISE(ABORT, 'An entry type''s parent must be another entry type of the same universe.');
            END;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                table: "EntityTypes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_UniverseId_ParentId",
                table: "EntityTypes",
                columns: new[] { "UniverseId", "ParentId" });

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Insert BEFORE INSERT ON EntityTypes
                {ParentOfSameUniverse}
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Update BEFORE UPDATE OF ParentId, UniverseId ON EntityTypes
                {ParentOfSameUniverse}
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_KeepsChildren_Delete BEFORE DELETE ON EntityTypes
                WHEN EXISTS (SELECT 1 FROM EntityTypes AS child WHERE child.ParentId = OLD.Id AND child.UniverseId = OLD.UniverseId)
                    AND EXISTS (SELECT 1 FROM Universes AS universe WHERE universe.Id = OLD.UniverseId)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type that contains nested types cannot be deleted.');
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_KeepsChildren_Delete;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Insert;");

            migrationBuilder.DropIndex(
                name: "IX_EntityTypes_UniverseId_ParentId",
                table: "EntityTypes");

            migrationBuilder.Sql("ALTER TABLE \"EntityTypes\" DROP COLUMN \"ParentId\";");
        }
    }
}
