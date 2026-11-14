using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddProjectScopedEntityTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EntityTypes_UniverseId_Name",
                table: "EntityTypes");

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "EntityTypes",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_ProjectId_Name",
                table: "EntityTypes",
                columns: new[] { "ProjectId", "Name" },
                unique: true,
                filter: "\"ProjectId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_UniverseId_Name",
                table: "EntityTypes",
                columns: new[] { "UniverseId", "Name" },
                unique: true,
                filter: "\"ProjectId\" IS NULL");

            // The parent must be in the same universe AND the same scope. SQLite's IS compares NULLs as equal, which is
            // what makes "both are lore types" count as the same scope.
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Insert;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_KeepsChildren_Delete;");

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Insert BEFORE INSERT ON EntityTypes
                WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM EntityTypes AS parent
                    WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId
                        AND parent.ProjectId IS NEW.ProjectId AND parent.Id <> NEW.Id)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type''s parent must be another entry type of the same universe and project.');
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Update BEFORE UPDATE OF ParentId, UniverseId, ProjectId ON EntityTypes
                WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM EntityTypes AS parent
                    WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId
                        AND parent.ProjectId IS NEW.ProjectId AND parent.Id <> NEW.Id)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type''s parent must be another entry type of the same universe and project.');
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_KeepsChildren_Delete BEFORE DELETE ON EntityTypes
                WHEN EXISTS (
                    SELECT 1 FROM EntityTypes AS child
                    WHERE child.ParentId = OLD.Id AND child.UniverseId = OLD.UniverseId
                        AND child.ProjectId IS OLD.ProjectId)
                    AND EXISTS (SELECT 1 FROM Universes AS universe WHERE universe.Id = OLD.UniverseId)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type that contains nested types cannot be deleted.');
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Order matters here, and the generated Down had it wrong in two ways.
            //
            // First, the triggers come back before the column goes: SQLite refuses to drop a column that a trigger
            // mentions, and the project-aware triggers mention ProjectId.
            //
            // Second, the column is dropped with SQLite's own ALTER rather than EF's DropColumn. EF implements a
            // column drop by rebuilding the table, and a rebuild of EntityTypes drops the table while triggers on
            // OTHER tables still reference it, so the rollback failed with
            // "error in trigger EntityTypeGroupMembers_SameUniverse_Insert: no such table: main.EntityTypes".
            // SQLite has supported ALTER TABLE ... DROP COLUMN since 3.35 and this schema runs on 3.50, so the
            // surgical form is available and leaves every other table's triggers alone.

            // Back to the universe-only triggers of AddEntityTypeHierarchy.
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Insert;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_ParentInUniverse_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypes_KeepsChildren_Delete;");

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Insert BEFORE INSERT ON EntityTypes
                WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM EntityTypes AS parent
                    WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId AND parent.Id <> NEW.Id)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type''s parent must be another entry type of the same universe.');
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_ParentInUniverse_Update BEFORE UPDATE OF ParentId, UniverseId ON EntityTypes
                WHEN NEW.ParentId IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM EntityTypes AS parent
                    WHERE parent.Id = NEW.ParentId AND parent.UniverseId = NEW.UniverseId AND parent.Id <> NEW.Id)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type''s parent must be another entry type of the same universe.');
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityTypes_KeepsChildren_Delete BEFORE DELETE ON EntityTypes
                WHEN EXISTS (SELECT 1 FROM EntityTypes AS child WHERE child.ParentId = OLD.Id AND child.UniverseId = OLD.UniverseId)
                    AND EXISTS (SELECT 1 FROM Universes AS universe WHERE universe.Id = OLD.UniverseId)
                BEGIN
                    SELECT RAISE(ABORT, 'An entry type that contains nested types cannot be deleted.');
                END;
                """);

            migrationBuilder.DropIndex(
                name: "IX_EntityTypes_ProjectId_Name",
                table: "EntityTypes");

            migrationBuilder.DropIndex(
                name: "IX_EntityTypes_UniverseId_Name",
                table: "EntityTypes");

            // No index and no trigger mentions ProjectId by this point, so SQLite drops it in place.
            migrationBuilder.Sql("""ALTER TABLE "EntityTypes" DROP COLUMN "ProjectId";""");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypes_UniverseId_Name",
                table: "EntityTypes",
                columns: ["UniverseId", "Name"],
                unique: true);
        }
    }
}
