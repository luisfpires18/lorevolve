using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using static LorEvolve.Api.Tests.VersionTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Full-text search over lore: what it finds, what it must never find, and what keeps it
/// honest when the lore changes underneath it. Credentials here are obviously synthetic.
/// </summary>
public sealed class EntitySearchTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    // ---------- What is searchable ----------

    [Fact]
    public async Task An_entry_is_found_by_its_name()
    {
        var (client, universe) = await SignedInWithUniverse("name");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Aldric Vane");
        await CreateEntity(client, universe.Id, type.Id, "Someone Else");

        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Aldric"));
    }

    [Fact]
    public async Task An_entry_is_found_by_an_alias()
    {
        var (client, universe) = await SignedInWithUniverse("alias");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Aldric Vane", aliases: ["The Kingmaker"]);
        await CreateEntity(client, universe.Id, type.Id, "Someone Else");

        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Kingmaker"));
    }

    [Fact]
    public async Task An_entry_is_found_by_its_summary()
    {
        var (client, universe) = await SignedInWithUniverse("summary");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(
            client, universe.Id, type.Id, "Torrin Blake", summary: "Keeper of the drowned coast.");
        await CreateEntity(client, universe.Id, type.Id, "Someone Else");

        Assert.Equal(["Torrin Blake"], await SearchNames(client, universe.Id, "drowned"));
    }

    /// <summary>The point of the whole phase: prose the author wrote inside the article.</summary>
    [Fact]
    public async Task An_entry_is_found_by_words_that_appear_only_in_its_article()
    {
        var (client, universe) = await SignedInWithUniverse("article");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(
            client,
            universe.Id,
            type.Id,
            "Plain Name",
            content: Article("The siege of Halloway broke on the third winter."));
        await CreateEntity(client, universe.Id, type.Id, "Someone Else");

        Assert.Equal(["Plain Name"], await SearchNames(client, universe.Id, "Halloway"));
        Assert.Equal(["Plain Name"], await SearchNames(client, universe.Id, "siege"));
    }

    /// <summary>
    /// The article is stored as Tiptap JSON, so the structure carries words no author typed:
    /// "doc", "paragraph", "type", "content", "text". Indexing the document instead of the prose
    /// would make every entry in the universe a match for each of them.
    /// </summary>
    [Fact]
    public async Task The_shape_of_the_article_document_is_not_searchable()
    {
        var (client, universe) = await SignedInWithUniverse("json");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(
            client,
            universe.Id,
            type.Id,
            "Plain Name",
            content: Article("Nothing notable happened here.", "Or here."));

        foreach (var word in new[] { "doc", "paragraph", "type", "content", "heading" })
        {
            Assert.Empty(await SearchNames(client, universe.Id, word));
        }

        // The prose in the same document is found, so the emptiness above is not an empty index.
        Assert.Equal(["Plain Name"], await SearchNames(client, universe.Id, "notable"));
    }

    // ---------- Staying in step with the lore ----------

    [Fact]
    public async Task Editing_the_article_updates_what_search_finds()
    {
        var (client, universe) = await SignedInWithUniverse("editarticle");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, type.Id, "Plain Name", content: Article("Sworn to the old queen."));

        Assert.Equal(["Plain Name"], await SearchNames(client, universe.Id, "sworn"));

        await UpdateEntity(client, universe.Id, entity, content: Article("Exiled to the salt marshes."));

        Assert.Empty(await SearchNames(client, universe.Id, "sworn"));
        Assert.Equal(["Plain Name"], await SearchNames(client, universe.Id, "marshes"));
    }

    [Fact]
    public async Task Renaming_an_entry_updates_what_search_finds()
    {
        var (client, universe) = await SignedInWithUniverse("rename");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(client, universe.Id, type.Id, "Aldric Vane");

        await UpdateEntity(client, universe.Id, entity, name: "Aldric Corrow");

        Assert.Empty(await SearchNames(client, universe.Id, "Vane"));
        Assert.Equal(["Aldric Corrow"], await SearchNames(client, universe.Id, "Corrow"));
    }

    [Fact]
    public async Task Adding_changing_and_removing_an_alias_all_reach_the_index()
    {
        var (client, universe) = await SignedInWithUniverse("aliasedit");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(client, universe.Id, type.Id, "Aldric Vane");
        Assert.Empty(await SearchNames(client, universe.Id, "Kingmaker"));

        await UpdateEntity(client, universe.Id, entity, aliases: ["The Kingmaker"]);
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Kingmaker"));

        await UpdateEntity(client, universe.Id, entity, aliases: ["The Widower"]);
        Assert.Empty(await SearchNames(client, universe.Id, "Kingmaker"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Widower"));

        await UpdateEntity(client, universe.Id, entity, aliases: []);
        Assert.Empty(await SearchNames(client, universe.Id, "Widower"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Aldric"));
    }

    /// <summary>
    /// An entry version puts back structured lore, and search follows it. The article is not part of an entry version -
    /// it keeps its own history, and its restore is covered by the article's own tests.
    /// </summary>
    [Fact]
    public async Task A_restored_revision_is_searchable_as_the_text_it_put_back()
    {
        var (client, universe) = await SignedInWithUniverse("revision");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, type.Id, "Aldric Vane", summary: "Sworn to the old queen.");
        (await client.PutVersionedAsync(
            $"/api/universes/{universe.Id}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId, entity.Name, "Exiled to the salt marshes.", entity.CanonStatus, entity.Aliases, entity.Tags, null)))
            .EnsureSuccessStatusCode();

        var history = await client.GetFromJsonAsync<List<EntityRevisionSummary>>(
            $"/api/universes/{universe.Id}/entities/{entity.Id}/revisions");
        var first = history!.Single(revision => revision.Number == 1);

        var restore = await RestoreEntryVersion(client, $"/api/universes/{universe.Id}/entities/{entity.Id}", first.Id);
        restore.EnsureSuccessStatusCode();

        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "sworn"));
        Assert.Empty(await SearchNames(client, universe.Id, "marshes"));
    }

    // ---------- Lifecycle ----------

    [Fact]
    public async Task Trashing_hides_an_entry_from_search_and_restoring_brings_it_back()
    {
        var (client, universe) = await SignedInWithUniverse("trash");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, type.Id, "Aldric Vane", content: Article("The siege of Halloway."));

        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{entity.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.Empty(await SearchNames(client, universe.Id, "Aldric"));
        Assert.Empty(await SearchNames(client, universe.Id, "Halloway"));

        var restored = await client.PostAsync(
            $"/api/universes/{universe.Id}/trash/{entity.Id}/restore", null);
        restored.EnsureSuccessStatusCode();

        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Aldric"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Halloway"));
    }

    /// <summary>
    /// Archiving is not reachable from the API today - the column exists and the listing reads
    /// it. Search inherits that contract rather than inventing one: hidden by default, shown
    /// when the caller asks for archived entries, exactly as browsing behaves.
    /// </summary>
    [Fact]
    public async Task An_archived_entry_follows_the_same_rule_search_as_it_does_browsing()
    {
        var (client, universe) = await SignedInWithUniverse("archived");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, type.Id, "Aldric Vane", content: Article("The siege of Halloway."));

        await WithDatabase(async db =>
        {
            await db.Entities.Where(candidate => candidate.Id == entity.Id)
                .ExecuteUpdateAsync(update => update.SetProperty(candidate => candidate.IsArchived, true));
        });

        Assert.Empty(await SearchNames(client, universe.Id, "Halloway"));
        Assert.Equal(
            ["Aldric Vane"],
            await SearchNames(client, universe.Id, "Halloway", "&includeArchived=true"));
    }

    /// <summary>
    /// The delete trigger. Nothing in the API destroys an entry any more, but dropping a universe
    /// still cascades through the foreign keys inside the database, where no C# runs.
    /// </summary>
    [Fact]
    public async Task Deleting_a_universe_takes_its_index_rows_with_it()
    {
        var (client, universe) = await SignedInWithUniverse("cascade");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client, universe.Id, type.Id, "Aldric Vane", content: Article("The siege of Halloway."));

        Assert.Equal(1, await IndexedRows(entity.Id));

        // Deleting a universe is only offered once it is archived.
        var archived = await client.PostAsync($"/api/universes/{universe.Id}/archive", null);
        archived.EnsureSuccessStatusCode();

        var deleted = await client.DeleteAsync($"/api/universes/{universe.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.Equal(0, await IndexedRows(entity.Id));
    }

    // ---------- Boundaries ----------

    [Fact]
    public async Task Search_never_reaches_another_universe()
    {
        var client = await SignedInClient("user-isolation");
        var first = await CreateUniverse(client, "Isolation One");
        var second = await CreateUniverse(client, "Isolation Two");

        var firstType = await FirstDefaultType(client, first.Id);
        var secondType = await FirstDefaultType(client, second.Id);

        await CreateEntity(
            client, first.Id, firstType.Id, "Aldric Vane", content: Article("The siege of Halloway."));
        await CreateEntity(client, second.Id, secondType.Id, "Unrelated Person");

        Assert.Equal(["Aldric Vane"], await SearchNames(client, first.Id, "Halloway"));
        Assert.Empty(await SearchNames(client, second.Id, "Halloway"));
        Assert.Empty(await SearchNames(client, second.Id, "Aldric"));
    }

    // ---------- What the author types ----------

    [Fact]
    public async Task Several_words_narrow_the_results()
    {
        var (client, universe) = await SignedInWithUniverse("words");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Grey Bird", aliases: ["The Grey Courier"]);
        await CreateEntity(client, universe.Id, type.Id, "Grey Tower");

        Assert.Equal(2, (await SearchNames(client, universe.Id, "grey")).Count);
        Assert.Equal(["Grey Bird"], await SearchNames(client, universe.Id, "grey bird"));
        Assert.Empty(await SearchNames(client, universe.Id, "grey harbour"));
    }

    /// <summary>The search box fires while the author is still typing the last word.</summary>
    [Fact]
    public async Task A_half_typed_last_word_still_matches()
    {
        var (client, universe) = await SignedInWithUniverse("prefix");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Aldric Vane");

        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Ald"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Aldric Va"));
    }

    /// <summary>
    /// Every one of these is FTS5 syntax, and none of it is ever run as syntax. A search box is
    /// not a query language.
    /// </summary>
    [Fact]
    public async Task Punctuation_and_query_syntax_are_searched_for_rather_than_obeyed()
    {
        var (client, universe) = await SignedInWithUniverse("syntax");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Ordinary Name");

        foreach (var input in new[]
        {
            "%", "\"", "*", "^", "(", ")", "()", "\"unbalanced", "a OR b", "NEAR(a b)",
            "-negated", "Name:", "column:value", "???", "\\", "' OR 1=1 --", "🙂",
        })
        {
            var response = await client.GetAsync(
                $"/api/universes/{universe.Id}/entities?search={Uri.EscapeDataString(input)}");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        // Punctuation-only input holds no word to look for, so it finds nothing rather than
        // everything - the same answer the LIKE search gave before there was an index.
        Assert.Empty(await SearchNames(client, universe.Id, "%"));

        // A word buried in punctuation is still that word.
        Assert.Equal(["Ordinary Name"], await SearchNames(client, universe.Id, "(Ordinary)"));
    }

    [Fact]
    public async Task An_empty_search_browses_instead_of_searching()
    {
        var (client, universe) = await SignedInWithUniverse("empty");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "First Person");
        await CreateEntity(client, universe.Id, type.Id, "Second Person");

        var blank = await ListEntities(client, universe.Id, "search=");
        var whitespace = await ListEntities(client, universe.Id, "search=%20%20");

        Assert.Equal(2, blank.TotalCount);
        Assert.Equal(2, whitespace.TotalCount);
    }

    // ---------- Order and paging ----------

    /// <summary>
    /// The one ranking claim worth making: an entry called what was typed beats an entry that
    /// merely mentions it. Recency ordering would have put the mention first here, because it
    /// was written last.
    /// </summary>
    [Fact]
    public async Task A_name_match_outranks_a_passing_mention_in_an_article()
    {
        var (client, universe) = await SignedInWithUniverse("ranking");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Aldric Vane", content: Article("A quiet man."));
        await CreateEntity(
            client,
            universe.Id,
            type.Id,
            "Council Minutes",
            content: Article("Aldric arrived late and said little."));

        var found = await SearchNames(client, universe.Id, "Aldric");

        Assert.Equal(["Aldric Vane", "Council Minutes"], found);
    }

    [Fact]
    public async Task Search_results_page_the_way_the_grid_expects()
    {
        var (client, universe) = await SignedInWithUniverse("searchpaging");
        var type = await FirstDefaultType(client, universe.Id);

        for (var index = 0; index < 5; index++)
        {
            await CreateEntity(
                client,
                universe.Id,
                type.Id,
                $"Chronicle Entry {index}",
                content: Article($"Part {index} of the chronicle of the western reach."));
        }

        await CreateEntity(client, universe.Id, type.Id, "Unrelated Person");

        var first = await ListEntities(client, universe.Id, "search=chronicle&page=1&pageSize=2");
        var second = await ListEntities(client, universe.Id, "search=chronicle&page=2&pageSize=2");
        var third = await ListEntities(client, universe.Id, "search=chronicle&page=3&pageSize=2");

        Assert.Equal(5, first.TotalCount);
        Assert.Equal(3, first.TotalPages);
        Assert.Equal(2, first.Items.Count);
        Assert.Single(third.Items);

        var seen = first.Items.Concat(second.Items).Concat(third.Items)
            .Select(item => item.Id)
            .ToList();

        Assert.Equal(5, seen.Distinct().Count());

        // The same page asked for twice is the same page: the order is a score, not a shuffle.
        var again = await ListEntities(client, universe.Id, "search=chronicle&page=1&pageSize=2");
        Assert.Equal(first.Items.Select(item => item.Id), again.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task Search_still_narrows_alongside_the_type_filter()
    {
        var (client, universe) = await SignedInWithUniverse("searchfilter");
        var types = await ListTypes(client, universe.Id);
        var character = types.First(type => type.Name == "Character");
        var location = types.First(type => type.Name == "Location");

        await CreateEntity(client, universe.Id, character.Id, "Halloway Vane");
        await CreateEntity(client, universe.Id, location.Id, "Halloway Keep");

        var filtered = await ListEntities(
            client, universe.Id, $"search=Halloway&entityTypeId={location.Id}");

        Assert.Equal(["Halloway Keep"], filtered.Items.Select(item => item.Name));
    }

    // ---------- Why an article matched ----------

    [Fact]
    public async Task An_article_match_carries_a_few_words_around_it_with_the_matched_word_marked()
    {
        var (client, universe) = await SignedInWithUniverse("excerpt");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client,
            universe.Id,
            type.Id,
            "Plain Name",
            content: Article(
                "Long before the war, when the tide still reached the old seawall,",
                "the siege of Halloway broke on the third winter and nobody who watched it fall ever spoke of the harbour again."));

        var item = Assert.Single((await ListEntities(client, universe.Id, "search=Halloway")).Items);
        Assert.Equal(entity.Id, item.Id);

        var excerpt = item.ArticleExcerpt!;
        Assert.Equal(["Halloway"], excerpt.Where(part => part.IsMatch).Select(part => part.Text));

        var text = string.Concat(excerpt.Select(part => part.Text));
        // FTS5 chooses where the fragment starts; wherever it does, the words beside the match are the article's own.
        Assert.Contains("the siege of Halloway", text, StringComparison.Ordinal);
        Assert.DoesNotContain("paragraph", text, StringComparison.Ordinal);
        Assert.DoesNotContain("{", text, StringComparison.Ordinal);
        Assert.True(text.Length < 200, $"An excerpt of a few words, not the article: {text.Length} characters.");
    }

    [Fact]
    public async Task A_match_found_elsewhere_carries_no_excerpt_and_browsing_carries_none()
    {
        var (client, universe) = await SignedInWithUniverse("noexcerpt");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Aldric Vane", content: Article("A quiet man."));
        await CreateEntity(client, universe.Id, type.Id, "Someone Else", content: Article("Aldric arrived late."));

        var page = await ListEntities(client, universe.Id, "pageSize=50&search=Aldric");
        Assert.Null(page.Items.Single(item => item.Name == "Aldric Vane").ArticleExcerpt);
        Assert.NotNull(page.Items.Single(item => item.Name == "Someone Else").ArticleExcerpt);

        Assert.All((await ListEntities(client, universe.Id, "pageSize=50")).Items, item => Assert.Null(item.ArticleExcerpt));
    }

    [Fact]
    public async Task An_excerpt_is_the_text_as_written_and_bounded_however_long_a_word_is()
    {
        var (client, universe) = await SignedInWithUniverse("excerptbound");
        var type = await FirstDefaultType(client, universe.Id);

        // Text that looks like markup is text: it comes back as written, for the client to render as text.
        await CreateEntity(
            client, universe.Id, type.Id, "Looks Like Markup", content: Article("<script>alert('Brannoch')</script> &amp; more"));
        var markup = Assert.Single((await ListEntities(client, universe.Id, "search=Brannoch")).Items);
        Assert.Contains("<script>alert('", string.Concat(markup.ArticleExcerpt!.Select(part => part.Text)), StringComparison.Ordinal);

        // One word of five thousand letters is still one word to the index, and still a short excerpt.
        await CreateEntity(
            client, universe.Id, type.Id, "One Long Word", content: Article("Mistral" + new string('x', 5_000) + " ends here."));
        var longWord = Assert.Single((await ListEntities(client, universe.Id, "search=Mistral")).Items);
        var text = string.Concat(longWord.ArticleExcerpt!.Select(part => part.Text));
        Assert.True(text.Length <= 241, $"Bounded: {text.Length} characters.");
        Assert.EndsWith("…", text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_article_save_and_restore_keep_what_search_finds_and_shows_in_step()
    {
        var (client, universe) = await SignedInWithUniverse("excerptstep");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(client, universe.Id, type.Id, "Plain Name", content: Article("Sworn to the old queen."));
        var rewritten = await ArticleTestClient.WriteArticle(client, universe.Id, entity.Id, Article("Exiled to the salt marshes."));

        Assert.Empty(await SearchNames(client, universe.Id, "sworn"));
        var exiled = Assert.Single((await ListEntities(client, universe.Id, "search=marshes")).Items);
        Assert.Equal(["marshes"], exiled.ArticleExcerpt!.Where(part => part.IsMatch).Select(part => part.Text));

        var first = (await ArticleTestClient.ArticleRevisions(client, universe.Id, entity.Id)).Last();
        (await ArticleTestClient.RestoreArticle(client, universe.Id, entity.Id, first.Id, rewritten.Version))
            .EnsureSuccessStatusCode();

        Assert.Empty(await SearchNames(client, universe.Id, "marshes"));
        var sworn = Assert.Single((await ListEntities(client, universe.Id, "search=sworn")).Items);
        Assert.Equal(["Sworn"], sworn.ArticleExcerpt!.Where(part => part.IsMatch).Select(part => part.Text));
    }

    // ---------- Content that was never well formed ----------

    [Fact]
    public async Task An_entry_with_no_article_indexes_and_searches_normally()
    {
        var (client, universe) = await SignedInWithUniverse("noarticle");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Bare Entry");
        await CreateEntity(client, universe.Id, type.Id, "Empty Doc", content: """{"type":"doc"}""");
        await CreateEntity(
            client, universe.Id, type.Id, "Empty Body", content: """{"type":"doc","content":[]}""");

        Assert.Equal(["Bare Entry"], await SearchNames(client, universe.Id, "Bare"));
        Assert.Equal(["Empty Doc"], await SearchNames(client, universe.Id, "Doc Empty"));
        Assert.Equal(["Empty Body"], await SearchNames(client, universe.Id, "Body"));
    }

    /// <summary>
    /// Content that validation would refuse today, written straight into the row the way a
    /// database that predates the validation would hold it. Indexing runs inside an author's
    /// save, so it may not throw on any of it - the article simply contributes nothing.
    /// </summary>
    [Fact]
    public async Task Malformed_and_legacy_article_content_indexes_without_breaking()
    {
        var (client, universe) = await SignedInWithUniverse("malformed");
        var type = await FirstDefaultType(client, universe.Id);

        var broken = await CreateEntity(client, universe.Id, type.Id, "Broken Article");
        var legacy = await CreateEntity(client, universe.Id, type.Id, "Legacy Article");

        await StoreRawContent(broken.Id, """{"type":"doc","content":[{"type":"para""");
        await StoreRawContent(legacy.Id, """{"content":[{"content":[{"text":"burrowed deep"}]}]}""");

        await Reindex();

        Assert.Equal(["Broken Article"], await SearchNames(client, universe.Id, "Broken"));
        Assert.Empty(await SearchNames(client, universe.Id, "para"));
        Assert.Equal(["Legacy Article"], await SearchNames(client, universe.Id, "burrowed"));
    }

    // ---------- Lore written before the index existed ----------

    /// <summary>
    /// An upgraded database: rows that were authored before the index existed have no index row,
    /// which is exactly the state the migration leaves them in. The startup backfill is what
    /// makes them findable, and it is the same code path a fresh start runs.
    /// </summary>
    [Fact]
    public async Task Entries_written_before_the_index_existed_are_searchable_after_the_backfill()
    {
        var (client, universe) = await SignedInWithUniverse("backfill");
        var type = await FirstDefaultType(client, universe.Id);

        var entity = await CreateEntity(
            client,
            universe.Id,
            type.Id,
            "Aldric Vane",
            aliases: ["The Kingmaker"],
            summary: "Keeper of the drowned coast.",
            content: Article("The siege of Halloway broke on the third winter."));

        await WithDatabase(async db =>
        {
            await db.Database.ExecuteSqlAsync(
                $"DELETE FROM EntitySearchIndex WHERE EntityId = {entity.Id}");
        });

        Assert.Empty(await SearchNames(client, universe.Id, "Aldric"));

        var indexed = 0;
        await WithDatabase(async db =>
        {
            indexed = await EntitySearchIndex.BackfillAsync(db, CancellationToken.None);
        });

        Assert.Equal(1, indexed);
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Aldric"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Kingmaker"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "drowned"));
        Assert.Equal(["Aldric Vane"], await SearchNames(client, universe.Id, "Halloway"));

        // Idempotent: a second start finds nothing to do and writes no duplicate row.
        await WithDatabase(async db =>
        {
            indexed = await EntitySearchIndex.BackfillAsync(db, CancellationToken.None);
        });

        Assert.Equal(0, indexed);
        Assert.Equal(1, await IndexedRows(entity.Id));
    }

    // ---------- Exact and order ----------

    [Fact]
    public async Task Exact_finds_only_the_entry_called_that_by_name_or_alias_ignoring_case()
    {
        var (client, universe) = await SignedInWithUniverse("exact");
        var type = await FirstDefaultType(client, universe.Id);

        await CreateEntity(client, universe.Id, type.Id, "Goku", aliases: ["Kakarot"]);
        await CreateEntity(client, universe.Id, type.Id, "Goku Black");
        await CreateEntity(client, universe.Id, type.Id, "Raditz", summary: "Goku's older brother.");

        Assert.Equal(3, (await SearchNames(client, universe.Id, "goku")).Count);
        Assert.Equal(["Goku"], await SearchNames(client, universe.Id, "GOKU", "&exact=true"));
        Assert.Equal(["Goku"], await SearchNames(client, universe.Id, " kakarot ", "&exact=true"));
        Assert.Empty(await SearchNames(client, universe.Id, "Gok", "&exact=true"));
    }

    [Fact]
    public async Task The_list_reads_by_name_ignoring_case_or_newest_created_first()
    {
        var (client, universe) = await SignedInWithUniverse("sort");
        var type = await FirstDefaultType(client, universe.Id);

        var bel = await CreateEntity(client, universe.Id, type.Id, "bel", summary: "A wandering hero.");
        await CreateEntity(client, universe.Id, type.Id, "Cara", summary: "A wandering hero.");
        await CreateEntity(client, universe.Id, type.Id, "Arin", summary: "A wandering hero.");
        // Edited last, so it leads the default order but not the created one.
        await UpdateEntity(client, universe.Id, bel, name: "Bel");

        var path = $"/api/universes/{universe.Id}/entities?pageSize=50";
        Assert.Equal(["Arin", "Bel", "Cara"], (await ListEntities(client, universe.Id, "pageSize=50&sort=name")).Items.Select(item => item.Name));
        Assert.Equal(["Arin", "Cara", "Bel"], (await ListEntities(client, universe.Id, "pageSize=50&sort=created")).Items.Select(item => item.Name));
        Assert.Equal("Bel", (await ListEntities(client, universe.Id, "pageSize=50")).Items[0].Name);
        Assert.Equal(["Arin", "Bel", "Cara"], await SearchNames(client, universe.Id, "hero", "&sort=name"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"{path}&sort=size")).StatusCode);
    }

    // ---------- Helpers ----------

    /// <summary>A Tiptap document, one paragraph per argument.</summary>
    private static string Article(params string[] paragraphs)
    {
        var blocks = paragraphs.Select(text =>
            $$"""{"type":"paragraph","content":[{"type":"text","text":{{JsonSerializer.Serialize(text)}}}]}""");

        return $$"""{"type":"doc","content":[{{string.Join(',', blocks)}}]}""";
    }

    private async Task WithDatabase(Func<LorEvolveDbContext, Task> work)
    {
        using var scope = _factory.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>());
    }

    /// <summary>Writes article content the API would refuse, the way an older row would hold it.</summary>
    private Task StoreRawContent(Guid entityId, string content) =>
        WithDatabase(async db =>
        {
            var now = DateTime.UtcNow;
            await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO EntityArticles (EntityId, Content, UpdatedAt) VALUES ({entityId}, {content}, {now})
                ON CONFLICT (EntityId) DO UPDATE SET Content = excluded.Content
                """);
            await db.Database.ExecuteSqlAsync(
                $"DELETE FROM EntitySearchIndex WHERE EntityId = {entityId}");
        });

    private Task Reindex() =>
        WithDatabase(db => EntitySearchIndex.BackfillAsync(db, CancellationToken.None));

    private async Task<int> IndexedRows(Guid entityId)
    {
        var count = 0;

        await WithDatabase(async db =>
        {
            count = await db.Database
                .SqlQuery<int>(
                    $"SELECT COUNT(*) AS Value FROM EntitySearchIndex WHERE EntityId = {entityId}")
                .SingleAsync(CancellationToken.None);
        });

        return count;
    }

    private async Task<HttpClient> SignedInClient(string username)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return client;
    }

    private async Task<(HttpClient Client, UniverseDetail Universe)> SignedInWithUniverse(string tag)
    {
        var client = await SignedInClient($"search-{tag}");
        return (client, await CreateUniverse(client, $"World {tag}"));
    }

    private static async Task<UniverseDetail> CreateUniverse(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/universes", new CreateUniverseRequest(name, null, null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<UniverseDetail>())!;
    }

    private static async Task<List<EntityTypeResponse>> ListTypes(HttpClient client, Guid universeId) =>
        (await client.GetFromJsonAsync<List<EntityTypeResponse>>(
            $"/api/universes/{universeId}/entity-types"))!;

    private static async Task<EntityTypeResponse> FirstDefaultType(HttpClient client, Guid universeId) =>
        (await ListTypes(client, universeId)).First(type => type.Name == "Character");

    private static async Task<EntityDetail> CreateEntity(
        HttpClient client,
        Guid universeId,
        Guid typeId,
        string name,
        string? summary = null,
        string? content = null,
        IReadOnlyList<string>? aliases = null)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/universes/{universeId}/entities",
            new EntityRequest(typeId, name, summary, CanonStatus.Idea, aliases, null, null));
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<EntityDetail>())!;

        // The article is saved on its own route, as the editor saves it.
        if (content is not null)
        {
            await ArticleTestClient.WriteArticle(client, universeId, created.Id, content);
        }

        return created;
    }

    /// <summary>
    /// A structured edit sends the whole entry, so anything not named here is written back as it was. An article is saved
    /// on its own route, and only when one is given.
    /// </summary>
    private static async Task<EntityDetail> UpdateEntity(
        HttpClient client,
        Guid universeId,
        EntityDetail entity,
        string? name = null,
        string? content = null,
        IReadOnlyList<string>? aliases = null)
    {
        if (content is not null)
        {
            await ArticleTestClient.WriteArticle(client, universeId, entity.Id, content);
        }

        if (name is null && aliases is null)
        {
            return entity;
        }

        var response = await client.PutVersionedAsync(
            $"/api/universes/{universeId}/entities/{entity.Id}",
            new EntityRequest(
                entity.EntityTypeId,
                name ?? entity.Name,
                entity.Summary,
                entity.CanonStatus,
                aliases ?? entity.Aliases,
                entity.Tags,
                null));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<EntityDetail>())!;
    }

    private static async Task<EntityPage> ListEntities(HttpClient client, Guid universeId, string query) =>
        (await client.GetFromJsonAsync<EntityPage>($"/api/universes/{universeId}/entities?{query}"))!;

    private static async Task<List<string>> SearchNames(
        HttpClient client,
        Guid universeId,
        string search,
        string extra = "")
    {
        var page = await ListEntities(
            client, universeId, $"pageSize=50&search={Uri.EscapeDataString(search)}{extra}");
        return page.Items.Select(item => item.Name).ToList();
    }
}
