using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// The SQLite FTS5 index behind entity search. Raw SQL because EF Core's model has no notion
    /// of a virtual table: nothing in <c>LorEvolveDbContext</c> maps to it, and the pending-model
    /// check therefore stays quiet about it in both directions.
    ///
    /// Created empty. Entries written before this migration have no row yet, and the startup
    /// backfill in <c>EntitySearchIndex.BackfillAsync</c> indexes them on the next start - text
    /// has to be extracted from the Tiptap document, which is C# work no migration can do in SQL.
    /// See <c>docs/architecture/decisions/0016-sqlite-full-text-search.md</c>.
    /// </summary>
    public partial class AddEntitySearchIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // One content-carrying row per entry, keyed by an UNINDEXED column so the key is
            // stored and returned but never searched. remove_diacritics 2 folds accents at both
            // index and query time; prefix indexes make the last word of an as-you-type query
            // cheap to match.
            migrationBuilder.Sql("""
                CREATE VIRTUAL TABLE EntitySearchIndex USING fts5(
                    EntityId UNINDEXED,
                    Name,
                    Aliases,
                    Summary,
                    Article,
                    tokenize = 'unicode61 remove_diacritics 2',
                    prefix = '2 3'
                );
                """);

            // Removal is the one synchronization C# cannot own, because it also has to survive
            // the deletes C# never sees - dropping a universe cascades through the foreign keys
            // straight in the database. A trigger catches every path at once, and needs no JSON.
            migrationBuilder.Sql("""
                CREATE TRIGGER EntitySearchIndex_EntityDeleted AFTER DELETE ON Entities BEGIN
                    DELETE FROM EntitySearchIndex WHERE EntityId = old.Id;
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS EntitySearchIndex_EntityDeleted;");
            migrationBuilder.Sql("DROP TABLE IF EXISTS EntitySearchIndex;");
        }
    }
}
