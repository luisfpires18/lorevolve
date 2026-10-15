using System.Runtime.CompilerServices;
using Lorex.Api.Data;
using Lorex.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Search;

/// <summary>
/// One row of a universe search index: the thing it points at, where in it the words were found, and how well it matched.
/// Keyless and never migrated - like <see cref="EntitySearchMatch"/>, it exists so the FTS5 queries below compose into
/// ordinary queries over the tables that say what is live and whose it is.
/// </summary>
public sealed class UniverseSearchMatch
{
    public Guid ItemId { get; set; }

    /// <summary>The narrowest set of columns holding every word, as a code each query documents. Ordered ascending.</summary>
    public int Field { get; set; }

    /// <summary>The BM25 score, negative, smaller is better. Compared only within one index and one kind, never across.</summary>
    public double Rank { get; set; }
}

/// <summary>The few words around a match in the two text columns a result can carry one in. Null where none matched.</summary>
public sealed record UniverseSearchExcerpts(
    IReadOnlyList<SearchExcerptPart>? First,
    IReadOnlyList<SearchExcerptPart>? Second);

/// <summary>
/// The SQLite FTS5 indexes behind the universe search (ADR 0031) for everything that is not lore: story planning text,
/// scene manuscripts, ideas and world rules. The only file that knows those indexes exist. Lore keeps its own index and file
/// (<see cref="EntitySearchIndex"/>, ADR 0016), whose tokenizing, excerpt and column filter rules this one reuses so the
/// two can never disagree about what a word or an excerpt is.
///
/// <b>Three managed FTS5 tables, created by the <c>AddUniverseSearchIndex</c> migration, which is where their columns, tokenizer
/// and triggers are written down:</b>
///
/// - <c>StorySearchIndex</c> (<c>Kind</c>, <c>ItemId</c>, <c>Title</c>, <c>Summary</c>, <c>Notes</c>): stories (their premise
///   in <c>Summary</c>), chapters, scenes, plot arcs and beats (their description in <c>Summary</c>).
/// - <c>SceneManuscriptSearchIndex</c> (<c>SceneId</c>, <c>Content</c>): each scene's saved prose.
/// - <c>IdeaSearchIndex</c> (<c>IdeaId</c>, <c>Title</c>, <c>Body</c>): every idea, whichever universe it names or none.
/// - <c>WorldRuleSearchIndex</c> (<c>WorldRuleId</c>, <c>Title</c>, <c>Description</c>): every world rule, created by the
///   <c>AddWorldRules</c> migration (ADR 0033).
///
/// Prose gets a table of its own so that looking up a scene's title never walks the posting lists of a million words of
/// manuscript; ideas get one because they are the account's, not a story's.
///
/// <b>Kept in step by the database, not by C#.</b> Unlike an entry's article, none of this text needs extracting from a
/// document, so SQLite triggers on each source table write the index inside the statement that changes the text: every
/// create, edit, cascade and future import path is covered at once, a rolled-back write takes its index change with it,
/// and nothing here has to be called from an endpoint. The triggers also turn the two excerpt marker characters into
/// spaces, as <see cref="EntitySearchIndex"/> does for lore.
///
/// <b>The index holds text and nothing else.</b> Whether something is in the Trash, inside something that is, in this
/// universe or owned by this account is answered by joining back to the tables that hold those facts. Trashing and
/// restoring write nothing here and cannot disagree with it.
///
/// Deliberately not an abstraction over "search": PostgreSQL will index this with its own full text, in a different way,
/// and this file is what gets replaced.
/// </summary>
public static class UniverseSearchIndex
{
    // ---------- What StorySearchIndex holds, as the triggers write it. Stored values: never renamed. ----------

    public const string StoryKind = "story";

    public const string ChapterKind = "chapter";

    public const string SceneKind = "scene";

    public const string PlotArcKind = "arc";

    public const string PlotBeatKind = "beat";

    // ---------- Field codes ----------

    /// <summary>Every word is in the title.</summary>
    public const int TitleField = 0;

    /// <summary>
    /// Story content: every word is in the title and the summary column - a chapter's or scene's summary, a story's premise,
    /// an arc's or beat's description. Ideas: the words reach into the body.
    /// </summary>
    public const int SecondField = 1;

    /// <summary>Story content only: the words reach into the notes.</summary>
    public const int NotesField = 2;

    /// <summary>
    /// Matching story content of one kind. The field is the narrowest of title, title and summary, or everything, that holds
    /// every word - the same question asked again with a column filter. The BM25 weights are title 10, summary 3, notes 1;
    /// the two key columns are unindexed and weigh nothing.
    /// </summary>
    public static IQueryable<UniverseSearchMatch> StoryContent(LorexDbContext db, string kind, string expression)
    {
        var title = EntitySearchIndex.ColumnFilter("Title", expression);
        var summary = EntitySearchIndex.ColumnFilter("Title Summary", expression);

        return db.Set<UniverseSearchMatch>().FromSql(
            $"""
            SELECT ItemId,
                   bm25(StorySearchIndex, 0.0, 0.0, 10.0, 3.0, 1.0) AS Rank,
                   CASE
                       WHEN rowid IN (SELECT rowid FROM StorySearchIndex WHERE StorySearchIndex MATCH {title}) THEN 0
                       WHEN rowid IN (SELECT rowid FROM StorySearchIndex WHERE StorySearchIndex MATCH {summary}) THEN 1
                       ELSE 2
                   END AS Field
            FROM StorySearchIndex
            WHERE StorySearchIndex MATCH {expression} AND Kind = {kind}
            """);
    }

    /// <summary>Scenes whose saved prose holds every word, keyed by the scene. One column, so one field.</summary>
    public static IQueryable<UniverseSearchMatch> Manuscripts(LorexDbContext db, string expression) =>
        db.Set<UniverseSearchMatch>().FromSql(
            $"""
            SELECT SceneId AS ItemId,
                   bm25(SceneManuscriptSearchIndex, 0.0, 1.0) AS Rank,
                   0 AS Field
            FROM SceneManuscriptSearchIndex
            WHERE SceneManuscriptSearchIndex MATCH {expression}
            """);

    /// <summary>Ideas holding every word: in the title (field 0), or reaching into the body (field 1). Title 10, body 1.</summary>
    public static IQueryable<UniverseSearchMatch> Ideas(LorexDbContext db, string expression)
    {
        var title = EntitySearchIndex.ColumnFilter("Title", expression);

        return db.Set<UniverseSearchMatch>().FromSql(
            $"""
            SELECT IdeaId AS ItemId,
                   bm25(IdeaSearchIndex, 0.0, 10.0, 1.0) AS Rank,
                   CASE
                       WHEN rowid IN (SELECT rowid FROM IdeaSearchIndex WHERE IdeaSearchIndex MATCH {title}) THEN 0
                       ELSE 1
                   END AS Field
            FROM IdeaSearchIndex
            WHERE IdeaSearchIndex MATCH {expression}
            """);
    }

    /// <summary>
    /// World rules holding every word: in the title (field 0), or reaching into the description (field 1). Title 10,
    /// description 1 - the same weights an idea's title and body have. Nothing but the text is indexed.
    /// </summary>
    public static IQueryable<UniverseSearchMatch> WorldRules(LorexDbContext db, string expression)
    {
        var title = EntitySearchIndex.ColumnFilter("Title", expression);

        return db.Set<UniverseSearchMatch>().FromSql(
            $"""
            SELECT WorldRuleId AS ItemId,
                   bm25(WorldRuleSearchIndex, 0.0, 10.0, 1.0) AS Rank,
                   CASE
                       WHEN rowid IN (SELECT rowid FROM WorldRuleSearchIndex WHERE WorldRuleSearchIndex MATCH {title}) THEN 0
                       ELSE 1
                   END AS Field
            FROM WorldRuleSearchIndex
            WHERE WorldRuleSearchIndex MATCH {expression}
            """);
    }

    /// <summary>
    /// For story content already chosen as results, the words around the match in the summary column (first) and the notes
    /// (second). Columns 3 and 4, in the migration's order.
    /// </summary>
    public static Task<Dictionary<Guid, UniverseSearchExcerpts>> StoryContentExcerptsAsync(
        LorexDbContext db,
        string expression,
        IReadOnlyList<Guid> ids,
        CancellationToken cancellationToken) =>
        ExcerptsAsync(db, "StorySearchIndex", "ItemId", 3, 4, expression, ids, cancellationToken);

    /// <summary>For scenes already chosen as results, the words around the match in their prose (first). Column 1.</summary>
    public static Task<Dictionary<Guid, UniverseSearchExcerpts>> ManuscriptExcerptsAsync(
        LorexDbContext db,
        string expression,
        IReadOnlyList<Guid> sceneIds,
        CancellationToken cancellationToken) =>
        ExcerptsAsync(db, "SceneManuscriptSearchIndex", "SceneId", 1, null, expression, sceneIds, cancellationToken);

    /// <summary>The passage of a scene's prose around <paramref name="find"/> (ADR 0045). Column 1 is <c>Content</c>.</summary>
    public static Task<string?> ManuscriptPassageAsync(LorexDbContext db, Guid sceneId, string? find, CancellationToken cancellationToken) =>
        EntitySearchIndex.PassageAsync(db, "SceneManuscriptSearchIndex", "SceneId", 1, "Content", find, sceneId, cancellationToken);

    /// <summary>For ideas already chosen as results, the words around the match in their body (first). Column 2.</summary>
    public static Task<Dictionary<Guid, UniverseSearchExcerpts>> IdeaExcerptsAsync(
        LorexDbContext db,
        string expression,
        IReadOnlyList<Guid> ideaIds,
        CancellationToken cancellationToken) =>
        ExcerptsAsync(db, "IdeaSearchIndex", "IdeaId", 2, null, expression, ideaIds, cancellationToken);

    /// <summary>For world rules already chosen as results, the words around the match in their description (first). Column 2.</summary>
    public static Task<Dictionary<Guid, UniverseSearchExcerpts>> WorldRuleExcerptsAsync(
        LorexDbContext db,
        string expression,
        IReadOnlyList<Guid> worldRuleIds,
        CancellationToken cancellationToken) =>
        ExcerptsAsync(db, "WorldRuleSearchIndex", "WorldRuleId", 2, null, expression, worldRuleIds, cancellationToken);

    /// <summary>
    /// FTS5's <c>snippet</c> for a handful of rows, by their key. The table, key and column numbers are written in this file,
    /// never taken from input; the expression and every id are parameters. Bounded by the ids, so no long text is cut for a
    /// row that is not a result, and nothing but the index's own copy of the text is read.
    /// </summary>
    private static async Task<Dictionary<Guid, UniverseSearchExcerpts>> ExcerptsAsync(
        LorexDbContext db,
        string table,
        string key,
        int first,
        int? second,
        string expression,
        IReadOnlyList<Guid> ids,
        CancellationToken cancellationToken)
    {
        var excerpts = new Dictionary<Guid, UniverseSearchExcerpts>();

        if (ids.Count == 0)
        {
            return excerpts;
        }

        var sql =
            $"SELECT {key} AS ItemId, "
            + EntitySearchIndex.SnippetSql(table, first) + " AS First, "
            + (second is { } column ? EntitySearchIndex.SnippetSql(table, column) : "NULL") + " AS Second "
            + $"FROM {table} WHERE {table} MATCH {{0}} AND {key} IN (" + EntitySearchIndex.Placeholders(ids.Count) + ")";

        object[] arguments = [expression, .. ids.Cast<object>()];

        var rows = await db.Database
            .SqlQuery<ExcerptRow>(FormattableStringFactory.Create(sql, arguments))
            .ToListAsync(cancellationToken);

        foreach (var row in rows)
        {
            excerpts[row.ItemId] = new UniverseSearchExcerpts(
                EntitySearchIndex.ParseExcerpt(row.First),
                EntitySearchIndex.ParseExcerpt(row.Second));
        }

        return excerpts;
    }

    /// <summary>One row of an excerpt query. Read through raw SQL; mapped to no table.</summary>
    private sealed class ExcerptRow
    {
        public Guid ItemId { get; set; }

        public string? First { get; set; }

        public string? Second { get; set; }
    }
}

/// <summary>
/// Read through raw SQL over virtual tables, so mapped to no table and no view. The FTS5 tables and their triggers are
/// created by <c>AddUniverseSearchIndex</c>, which EF Core's model knows nothing about.
/// </summary>
public sealed class UniverseSearchMatchConfiguration : IEntityTypeConfiguration<UniverseSearchMatch>
{
    public void Configure(EntityTypeBuilder<UniverseSearchMatch> builder)
    {
        builder.HasNoKey();
        builder.ToView(null);
    }
}
