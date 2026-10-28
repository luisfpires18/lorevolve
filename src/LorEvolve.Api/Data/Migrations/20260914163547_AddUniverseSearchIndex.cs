using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// The universe search's own indexes (ADR 0031): story planning text, scene manuscripts and ideas, as three SQLite FTS5
    /// tables kept in step by triggers. Raw SQL, like <c>AddEntitySearchIndex</c>, because EF Core's model has no notion of a
    /// virtual table or a trigger - the pending-model check cannot see any of it, in either direction.
    ///
    /// Filled here, from what is already written: none of this text needs extracting from a document, so SQL can copy it and
    /// no startup backfill is owed. Everything is copied, the Trash included - an index holds text only, and whether a row is
    /// live is answered by joining back to it when searching.
    ///
    /// Every copy - the fill and each trigger - turns the two characters an excerpt marks matches with (U+E000, U+E001) into
    /// spaces, so an excerpt can never mistake the author's own for a marker. The lore index gets the same rule in C#; its rows
    /// that hold either character are removed here, and the startup backfill writes them again, cleaned.
    ///
    /// Rolling back drops the three tables and every trigger, and touches no authored row.
    /// </summary>
    public partial class AddUniverseSearchIndex : Migration
    {
        /// <summary>The lore index's tokenizer and prefix settings, so every index in LorEvolve splits and folds words alike.</summary>
        private const string Tokenizer = "tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3'";

        /// <summary>The story content tables: table, trigger name part, kind as stored, and the columns read into Summary and Notes.</summary>
        private static readonly (string Table, string Name, string Kind, string Summary, string Notes)[] StoryContent =
        [
            ("Stories", "Story", "story", "Premise", null),
            ("Chapters", "Chapter", "chapter", "Summary", "Notes"),
            ("Scenes", "Scene", "scene", "Summary", "Notes"),
            ("PlotArcs", "PlotArc", "arc", "Description", "Notes"),
            ("PlotBeats", "PlotBeat", "beat", "Description", "Notes"),
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ---------- Story planning text: stories, chapters, scenes, arcs, beats ----------

            // One row per thing, keyed by its kind and id - both stored and returned, never searched. A story's premise and
            // an arc's or beat's description sit in Summary, so one column means "the short text under the title" for all.
            migrationBuilder.Sql($"""
                CREATE VIRTUAL TABLE StorySearchIndex USING fts5(
                    Kind UNINDEXED,
                    ItemId UNINDEXED,
                    Title,
                    Summary,
                    Notes,
                    {Tokenizer}
                );
                """);

            foreach (var (table, name, kind, summary, notes) in StoryContent)
            {
                var notesValue = notes is null ? "''" : Clean($"coalesce(new.{notes}, '')");
                var insert = $"""
                    INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
                    VALUES ('{kind}', new.Id, {Clean("new.Title")}, {Clean($"coalesce(new.{summary}, '')")}, {notesValue});
                    """;

                var watched = notes is null ? $"Title, {summary}" : $"Title, {summary}, {notes}";
                var changed = notes is null
                    ? $"old.Title IS NOT new.Title OR old.{summary} IS NOT new.{summary}"
                    : $"old.Title IS NOT new.Title OR old.{summary} IS NOT new.{summary} OR old.{notes} IS NOT new.{notes}";

                migrationBuilder.Sql($"""
                    CREATE TRIGGER StorySearchIndex_{name}Inserted AFTER INSERT ON {table} BEGIN
                        {insert}
                    END;
                    """);

                // Only a change to indexed text rewrites the row: a reorder, a move, a timestamp or the Trash marker does not.
                migrationBuilder.Sql($"""
                    CREATE TRIGGER StorySearchIndex_{name}Updated AFTER UPDATE OF {watched} ON {table}
                    WHEN {changed}
                    BEGIN
                        DELETE FROM StorySearchIndex WHERE Kind = '{kind}' AND ItemId = old.Id;
                        {insert}
                    END;
                    """);

                // Nothing in the API deletes story content for good, but deleting a universe cascades through it inside the
                // database, where no C# runs.
                migrationBuilder.Sql($"""
                    CREATE TRIGGER StorySearchIndex_{name}Deleted AFTER DELETE ON {table} BEGIN
                        DELETE FROM StorySearchIndex WHERE Kind = '{kind}' AND ItemId = old.Id;
                    END;
                    """);

                var notesColumn = notes is null ? "''" : Clean($"coalesce({notes}, '')");
                migrationBuilder.Sql($"""
                    INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
                    SELECT '{kind}', Id, {Clean("Title")}, {Clean($"coalesce({summary}, '')")}, {notesColumn}
                    FROM {table};
                    """);
            }

            // ---------- Scene manuscripts ----------

            // Apart from the planning text, so a search of titles and summaries never walks the posting lists of the prose.
            migrationBuilder.Sql($"""
                CREATE VIRTUAL TABLE SceneManuscriptSearchIndex USING fts5(
                    SceneId UNINDEXED,
                    Content,
                    {Tokenizer}
                );
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER SceneManuscriptSearchIndex_ManuscriptInserted AFTER INSERT ON SceneManuscripts BEGIN
                    INSERT INTO SceneManuscriptSearchIndex (SceneId, Content) VALUES (new.SceneId, {Clean("new.Content")});
                END;
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER SceneManuscriptSearchIndex_ManuscriptUpdated AFTER UPDATE OF Content ON SceneManuscripts
                WHEN old.Content IS NOT new.Content
                BEGIN
                    DELETE FROM SceneManuscriptSearchIndex WHERE SceneId = old.SceneId;
                    INSERT INTO SceneManuscriptSearchIndex (SceneId, Content) VALUES (new.SceneId, {Clean("new.Content")});
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER SceneManuscriptSearchIndex_ManuscriptDeleted AFTER DELETE ON SceneManuscripts BEGIN
                    DELETE FROM SceneManuscriptSearchIndex WHERE SceneId = old.SceneId;
                END;
                """);

            migrationBuilder.Sql($"""
                INSERT INTO SceneManuscriptSearchIndex (SceneId, Content)
                SELECT SceneId, {Clean("Content")} FROM SceneManuscripts;
                """);

            // ---------- Ideas ----------

            // Every idea, assigned or not: which universe an idea names, and whether it is deleted, are the Ideas row's to say.
            migrationBuilder.Sql($"""
                CREATE VIRTUAL TABLE IdeaSearchIndex USING fts5(
                    IdeaId UNINDEXED,
                    Title,
                    Body,
                    {Tokenizer}
                );
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER IdeaSearchIndex_IdeaInserted AFTER INSERT ON Ideas BEGIN
                    INSERT INTO IdeaSearchIndex (IdeaId, Title, Body) VALUES (new.Id, {Clean("new.Title")}, {Clean("new.Body")});
                END;
                """);

            // Releasing an idea from a deleted universe moves its universe and timestamp, not its words: no rewrite.
            migrationBuilder.Sql($"""
                CREATE TRIGGER IdeaSearchIndex_IdeaUpdated AFTER UPDATE OF Title, Body ON Ideas
                WHEN old.Title IS NOT new.Title OR old.Body IS NOT new.Body
                BEGIN
                    DELETE FROM IdeaSearchIndex WHERE IdeaId = old.Id;
                    INSERT INTO IdeaSearchIndex (IdeaId, Title, Body) VALUES (new.Id, {Clean("new.Title")}, {Clean("new.Body")});
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER IdeaSearchIndex_IdeaDeleted AFTER DELETE ON Ideas BEGIN
                    DELETE FROM IdeaSearchIndex WHERE IdeaId = old.Id;
                END;
                """);

            migrationBuilder.Sql($"""
                INSERT INTO IdeaSearchIndex (IdeaId, Title, Body)
                SELECT Id, {Clean("Title")}, {Clean("Body")} FROM Ideas;
                """);

            // ---------- Lore rows holding an excerpt marker ----------

            // Written before the index cleaned them. Taken out so the startup backfill indexes them again through the code
            // that now does; every other lore row is already exactly what it would write.
            migrationBuilder.Sql("""
                DELETE FROM EntitySearchIndex
                WHERE instr(Name || Aliases || Summary || Article, char(57344)) > 0
                   OR instr(Name || Aliases || Summary || Article, char(57345)) > 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var (_, name, _, _, _) in StoryContent)
            {
                migrationBuilder.Sql($"DROP TRIGGER IF EXISTS StorySearchIndex_{name}Inserted;");
                migrationBuilder.Sql($"DROP TRIGGER IF EXISTS StorySearchIndex_{name}Updated;");
                migrationBuilder.Sql($"DROP TRIGGER IF EXISTS StorySearchIndex_{name}Deleted;");
            }

            migrationBuilder.Sql("DROP TRIGGER IF EXISTS SceneManuscriptSearchIndex_ManuscriptInserted;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS SceneManuscriptSearchIndex_ManuscriptUpdated;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS SceneManuscriptSearchIndex_ManuscriptDeleted;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS IdeaSearchIndex_IdeaInserted;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS IdeaSearchIndex_IdeaUpdated;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS IdeaSearchIndex_IdeaDeleted;");

            migrationBuilder.Sql("DROP TABLE IF EXISTS StorySearchIndex;");
            migrationBuilder.Sql("DROP TABLE IF EXISTS SceneManuscriptSearchIndex;");
            migrationBuilder.Sql("DROP TABLE IF EXISTS IdeaSearchIndex;");
        }

        /// <summary>A column or expression as the index copies it: the two excerpt marker characters become spaces.</summary>
        private static string Clean(string value) => $"replace(replace({value}, char(57344), ' '), char(57345), ' ')";
    }
}
