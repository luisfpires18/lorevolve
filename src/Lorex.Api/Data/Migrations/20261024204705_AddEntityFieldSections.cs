using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <summary>
    /// Optional sections for a type's fields (Issue #26, ADR 0007 amendment). Additive only: the table
    /// <c>EntityFieldSections</c> (cascading from its type), a nullable <c>EntityFieldDefinitions.SectionId</c> with its index,
    /// and <c>EntityTypes.FieldLayoutVersion</c>, 1 for every existing type - the value a new type gets, so every layout is
    /// editable at once. No existing row is written beyond that: no type gains a section and every field stays ungrouped, so
    /// every form reads exactly as it did and nothing has to be set up. Field ids, values, versions and order are untouched.
    ///
    /// No foreign key on <c>SectionId</c>, on purpose, as for <c>EntityTypes.ParentId</c>: SQLite adds one only by rebuilding
    /// <c>EntityFieldDefinitions</c>, which would drop the triggers already on it and change the order a universe's delete
    /// cascades in, and it could not drop a column a key uses on the way back. Triggers give what a key would, and one more:
    ///
    /// <list type="bullet">
    /// <item>a field's section is a section of the field's own type, on every insert and every change of section or type;</item>
    /// <item>removing a section puts its fields, archived ones included, back among the ungrouped fields.</item>
    /// </list>
    ///
    /// Rolling back drops the triggers, the index and both columns with SQLite's own <c>DROP COLUMN</c>, and the table: nothing
    /// is rebuilt either way. Sections are lost; every field is ungrouped again.
    /// </summary>
    public partial class AddEntityFieldSections : Migration
    {
        private const string SectionOfSameType = """
            WHEN NEW.SectionId IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM EntityFieldSections AS section
                WHERE section.Id = NEW.SectionId AND section.EntityTypeId = NEW.EntityTypeId)
            BEGIN
                SELECT RAISE(ABORT, 'A field''s section must be a section of its own entry type.');
            END;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FieldLayoutVersion",
                table: "EntityTypes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "SectionId",
                table: "EntityFieldDefinitions",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EntityFieldSections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityTypeId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    DisplayOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    StartsCollapsed = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityFieldSections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityFieldSections_EntityTypes_EntityTypeId",
                        column: x => x.EntityTypeId,
                        principalTable: "EntityTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldDefinitions_SectionId",
                table: "EntityFieldDefinitions",
                column: "SectionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldSections_EntityTypeId",
                table: "EntityFieldSections",
                column: "EntityTypeId");

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityFieldDefinitions_SectionOfType_Insert BEFORE INSERT ON EntityFieldDefinitions
                {SectionOfSameType}
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityFieldDefinitions_SectionOfType_Update BEFORE UPDATE OF SectionId, EntityTypeId ON EntityFieldDefinitions
                {SectionOfSameType}
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER EntityFieldSections_Ungroup_Delete AFTER DELETE ON EntityFieldSections
                BEGIN
                    UPDATE EntityFieldDefinitions SET SectionId = NULL WHERE SectionId = OLD.Id;
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityFieldSections_Ungroup_Delete;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityFieldDefinitions_SectionOfType_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityFieldDefinitions_SectionOfType_Insert;");

            migrationBuilder.DropIndex(
                name: "IX_EntityFieldDefinitions_SectionId",
                table: "EntityFieldDefinitions");

            migrationBuilder.Sql("""ALTER TABLE "EntityFieldDefinitions" DROP COLUMN "SectionId";""");
            migrationBuilder.Sql("""ALTER TABLE "EntityTypes" DROP COLUMN "FieldLayoutVersion";""");

            migrationBuilder.DropTable(
                name: "EntityFieldSections");
        }
    }
}
