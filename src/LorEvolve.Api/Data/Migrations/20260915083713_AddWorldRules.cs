using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// World rules (ADR 0033): the <c>WorldRules</c> table, owned by its universe and deleted with it, and the universe search's
    /// derived copy of their words - an FTS5 table kept in step by three triggers, exactly as ADR 0031 keeps ideas. Additive:
    /// nothing that exists changes, and no existing table is rebuilt, so no other trigger can be lost.
    ///
    /// The virtual table and the triggers are raw SQL, invisible to the pending-model check in either direction;
    /// <c>WorldRuleMigrationTests</c> reads each trigger back from SQLite by name. No fill is owed: the table is new, so there is
    /// no rule to copy. Every copy turns the two excerpt marker characters (U+E000, U+E001) into spaces, as every other index does.
    ///
    /// Rolling back drops the triggers, the index and the table - and with them every rule: the schema before had no room for one.
    /// </summary>
    public partial class AddWorldRules : Migration
    {
        /// <summary>The lore index's tokenizer and prefix settings, so every index in LorEvolve splits and folds words alike.</summary>
        private const string Tokenizer = "tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorldRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 10000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorldRules_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorldRules_UniverseId_DeletedAt",
                table: "WorldRules",
                columns: new[] { "UniverseId", "DeletedAt" });

            // ---------- The universe search's copy of a rule's words ----------

            // Text only. Which universe a rule belongs to, and whether it is in the Trash, are the WorldRules row's to say.
            migrationBuilder.Sql($"""
                CREATE VIRTUAL TABLE WorldRuleSearchIndex USING fts5(
                    WorldRuleId UNINDEXED,
                    Title,
                    Description,
                    {Tokenizer}
                );
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER WorldRuleSearchIndex_WorldRuleInserted AFTER INSERT ON WorldRules BEGIN
                    INSERT INTO WorldRuleSearchIndex (WorldRuleId, Title, Description)
                    VALUES (new.Id, {Clean("new.Title")}, {Clean("new.Description")});
                END;
                """);

            // Only a change to the words rewrites the row: the Trash marker and a timestamp do not.
            migrationBuilder.Sql($"""
                CREATE TRIGGER WorldRuleSearchIndex_WorldRuleUpdated AFTER UPDATE OF Title, Description ON WorldRules
                WHEN old.Title IS NOT new.Title OR old.Description IS NOT new.Description
                BEGIN
                    DELETE FROM WorldRuleSearchIndex WHERE WorldRuleId = old.Id;
                    INSERT INTO WorldRuleSearchIndex (WorldRuleId, Title, Description)
                    VALUES (new.Id, {Clean("new.Title")}, {Clean("new.Description")});
                END;
                """);

            // Nothing in the API deletes a rule for good, but deleting a universe cascades to its rules inside the database,
            // where no C# runs.
            migrationBuilder.Sql("""
                CREATE TRIGGER WorldRuleSearchIndex_WorldRuleDeleted AFTER DELETE ON WorldRules BEGIN
                    DELETE FROM WorldRuleSearchIndex WHERE WorldRuleId = old.Id;
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS WorldRuleSearchIndex_WorldRuleInserted;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS WorldRuleSearchIndex_WorldRuleUpdated;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS WorldRuleSearchIndex_WorldRuleDeleted;");
            migrationBuilder.Sql("DROP TABLE IF EXISTS WorldRuleSearchIndex;");

            migrationBuilder.DropTable(
                name: "WorldRules");
        }

        /// <summary>A column or expression as the index copies it: the two excerpt marker characters become spaces.</summary>
        private static string Clean(string value) => $"replace(replace({value}, char(57344), ' '), char(57345), ' ')";
    }
}
