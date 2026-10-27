using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Semantic groups of Lore types (Issue #36, ADR 0007 amendment). Additive only: two new tables, <c>EntityTypeGroups</c>
    /// and the membership <c>EntityTypeGroupMembers</c>, and a nullable <c>EntityFieldDefinitions.TargetGroupId</c>. No
    /// existing row is written: no universe gains a group, no type a membership and no field a group target, and nothing is
    /// inferred from a name. Type ids, fields, exact-type targets and Family Tree eligibility are untouched.
    ///
    /// The group target's column is added with its key in one <c>ALTER TABLE ... ADD ... REFERENCES</c>, which SQLite allows
    /// for a nullable column, so <c>EntityFieldDefinitions</c> is not rebuilt: EF would rebuild it at the end of the migration,
    /// dropping the triggers below with it, and a rebuilt table also changes the order a universe's delete cascades in. Two
    /// guarantees the keys cannot give are triggers:
    ///
    /// <list type="bullet">
    /// <item>a membership joins a group and a type of the same universe;</item>
    /// <item>a field's group target is a group of its own type's universe, and never set beside an exact type target.</item>
    /// </list>
    ///
    /// Rolling back drops the triggers, then the key and the column (SQLite cannot drop a column a key uses, so that table is
    /// rebuilt there), and both tables. Groups, memberships and group targets are lost; every field that targeted a group reads
    /// as open to any type.
    /// </summary>
    public partial class AddEntityTypeGroups : Migration
    {
        private const string MemberOfSameUniverse = """
            WHEN NOT EXISTS (
                SELECT 1 FROM EntityTypeGroups AS grp
                JOIN EntityTypes AS type ON type.Id = NEW.EntityTypeId
                WHERE grp.Id = NEW.EntityTypeGroupId AND grp.UniverseId = type.UniverseId)
            BEGIN
                SELECT RAISE(ABORT, 'A semantic group and its member types must belong to the same universe.');
            END;
            """;

        private const string TargetGroupOfSameUniverse = """
            WHEN NEW.TargetGroupId IS NOT NULL AND (NEW.TargetEntityTypeId IS NOT NULL OR NOT EXISTS (
                SELECT 1 FROM EntityTypeGroups AS grp
                JOIN EntityTypes AS type ON type.Id = NEW.EntityTypeId
                WHERE grp.Id = NEW.TargetGroupId AND grp.UniverseId = type.UniverseId))
            BEGIN
                SELECT RAISE(ABORT, 'A link field''s group must be a group of its own universe, and not beside an exact type.');
            END;
            """;

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EntityTypeGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityTypeGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntityTypeGroups_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EntityTypeGroupMembers",
                columns: table => new
                {
                    EntityTypeGroupId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityTypeId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EntityTypeGroupMembers", x => new { x.EntityTypeGroupId, x.EntityTypeId });
                    table.ForeignKey(
                        name: "FK_EntityTypeGroupMembers_EntityTypeGroups_EntityTypeGroupId",
                        column: x => x.EntityTypeGroupId,
                        principalTable: "EntityTypeGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EntityTypeGroupMembers_EntityTypes_EntityTypeId",
                        column: x => x.EntityTypeId,
                        principalTable: "EntityTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // No action on delete, as the model says: the group endpoint refuses first, and a universe's delete removes the
            // field and the group in the same statement.
            migrationBuilder.Sql("""
                ALTER TABLE "EntityFieldDefinitions" ADD "TargetGroupId" TEXT NULL
                    CONSTRAINT "FK_EntityFieldDefinitions_EntityTypeGroups_TargetGroupId" REFERENCES "EntityTypeGroups" ("Id");
                """);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldDefinitions_TargetGroupId",
                table: "EntityFieldDefinitions",
                column: "TargetGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypeGroupMembers_EntityTypeId",
                table: "EntityTypeGroupMembers",
                column: "EntityTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityTypeGroups_UniverseId_Name",
                table: "EntityTypeGroups",
                columns: new[] { "UniverseId", "Name" },
                unique: true);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityTypeGroupMembers_SameUniverse_Insert BEFORE INSERT ON EntityTypeGroupMembers
                {MemberOfSameUniverse}
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityTypeGroupMembers_SameUniverse_Update BEFORE UPDATE ON EntityTypeGroupMembers
                {MemberOfSameUniverse}
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityFieldDefinitions_TargetGroup_Insert BEFORE INSERT ON EntityFieldDefinitions
                {TargetGroupOfSameUniverse}
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER EntityFieldDefinitions_TargetGroup_Update BEFORE UPDATE OF TargetGroupId, TargetEntityTypeId, EntityTypeId ON EntityFieldDefinitions
                {TargetGroupOfSameUniverse}
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityFieldDefinitions_TargetGroup_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityFieldDefinitions_TargetGroup_Insert;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypeGroupMembers_SameUniverse_Update;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntityTypeGroupMembers_SameUniverse_Insert;");

            // A field's group target goes before the groups, so dropping their table breaks no key.
            migrationBuilder.Sql("UPDATE \"EntityFieldDefinitions\" SET \"TargetGroupId\" = NULL WHERE \"TargetGroupId\" IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_EntityFieldDefinitions_EntityTypeGroups_TargetGroupId",
                table: "EntityFieldDefinitions");

            migrationBuilder.DropTable(
                name: "EntityTypeGroupMembers");

            migrationBuilder.DropTable(
                name: "EntityTypeGroups");

            migrationBuilder.DropIndex(
                name: "IX_EntityFieldDefinitions_TargetGroupId",
                table: "EntityFieldDefinitions");

            migrationBuilder.DropColumn(
                name: "TargetGroupId",
                table: "EntityFieldDefinitions");
        }
    }
}
