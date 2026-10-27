using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Ideas;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Idea boards (ADR 0066): account-owned canvases of notes, ideas and entries, saved whole, refused when stale, never holding
/// another account's ideas or another universe's entries, kept marked when what a card shows is deleted, and kept -
/// unassigned, without their entry cards - when their universe is deleted.
/// </summary>
public sealed class IdeaBoardTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Boards = "/api/idea-boards";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_board_is_created_and_read_back_exactly_in_draw_order()
    {
        var client = await SignedIn(_factory, "user-boardcreate");
        var idea = await CreateIdea(client, "Maybe this city floats", "Held up by old storms.");

        var note = Note(-120.5, 40.25, "  The underside nobody has seen  ");
        var ideaCard = IdeaCard(idea.Id, 300, 60);
        var created = await Create(
            client,
            "  City thoughts  ",
            cards: [note, ideaCard],
            connections: [Line(note, ideaCard, "  why?  ")]);

        Assert.Equal("City thoughts", created.Title);
        Assert.Null(created.Universe);
        Assert.Equal([note.Id, ideaCard.Id], created.Cards.Select(card => card.Id));
        Assert.Equal((-120.5, 40.25, 200d, 120d), (created.Cards[0].X, created.Cards[0].Y, created.Cards[0].Width, created.Cards[0].Height));
        Assert.Equal("  The underside nobody has seen  ", created.Cards[0].Text);
        Assert.Equal(("Maybe this city floats", "Held up by old storms.", false), (created.Cards[1].Name, created.Cards[1].Excerpt, created.Cards[1].IsGone));
        Assert.Equal("why?", Assert.Single(created.Connections).Label);

        Assert.Equal(created, await Read(client, created.Id), BoardComparer.Instance);
    }

    [Fact]
    public async Task Another_account_never_sees_or_touches_a_board_or_places_someone_elses_idea()
    {
        var (owner, universe) = await SignedInWithUniverse(_factory, "boardowner");
        var stranger = await SignedIn(_factory, "user-boardstranger");
        var board = await Create(owner, "Mine", universeId: universe.Id);
        var ownersIdea = await CreateIdea(owner, "Owner's idea");

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"{Boards}/{board.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync($"{Boards}/{board.Id}", Request(board))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"{Boards}/{board.Id}")).StatusCode);
        Assert.Empty((await List(stranger)).Items);

        var placed = await stranger.PostAsJsonAsync(Boards, new IdeaBoardRequest("Theft", null, [IdeaCard(ownersIdea.Id)], [], null));
        Assert.Contains("Choose one of your ideas", await Errors(placed), StringComparison.Ordinal);

        var intoTheirs = await stranger.PostAsJsonAsync(Boards, new IdeaBoardRequest("Theirs", universe.Id, [], [], null));
        Assert.Contains("universeId", await Errors(intoTheirs), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Entry_cards_need_the_boards_own_universe_and_a_trashed_entry_stays_but_is_never_newly_placed()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "boardentries");
        var other = await CreateUniverse(client, "Other boardentries");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var mira = await CreateEntity(client, universe.Id, "Mira");
        var stranger = await CreateEntity(client, other.Id, "Elsewhere");

        var loose = await client.PostAsJsonAsync(Boards, new IdeaBoardRequest("Loose", null, [EntryCard(arlen)], [], null));
        Assert.Contains("belongs to no universe", await Errors(loose), StringComparison.Ordinal);

        var foreign = await client.PostAsJsonAsync(Boards, new IdeaBoardRequest("Mixed", universe.Id, [EntryCard(stranger)], [], null));
        Assert.Contains("not in its universe", await Errors(foreign), StringComparison.Ordinal);

        var arlenCard = EntryCard(arlen);
        var board = await Create(client, "Cast", universeId: universe.Id, cards: [arlenCard]);
        Assert.Equal(("Arlen", "Character", false), (board.Cards[0].Name, board.Cards[0].EntityTypeName, board.Cards[0].IsGone));

        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{arlen}")).EnsureSuccessStatusCode();
        (await client.DeleteAsync($"/api/universes/{universe.Id}/entities/{mira}")).EnsureSuccessStatusCode();

        var marked = await Read(client, board.Id);
        Assert.True(Assert.Single(marked.Cards).IsGone);

        // Sent back, the trashed entry is kept; newly placed, the other one is refused.
        var kept = await Save(client, marked, title: "Cast, renamed");
        Assert.Equal("Cast, renamed", kept.Title);
        var newly = await TrySave(client, kept, cards: [.. Inputs(kept), EntryCard(mira)]);
        Assert.Contains("Trash", await Errors(newly), StringComparison.Ordinal);

        // A new universe with the old universe's entry still on the board is refused, never quietly emptied.
        var moved = await TrySave(client, kept, universeId: other.Id);
        Assert.Contains("not in its universe", await Errors(moved), StringComparison.Ordinal);
        Assert.Single((await Read(client, board.Id)).Cards);
    }

    [Fact]
    public async Task A_universe_board_takes_its_own_and_unassigned_ideas_and_a_deleted_idea_stays_marked()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "boardideas");
        var other = await CreateUniverse(client, "Other boardideas");
        var own = await CreateIdea(client, "Own", universeId: universe.Id);
        var unassigned = await CreateIdea(client, "Unassigned");
        var elsewhere = await CreateIdea(client, "Elsewhere", universeId: other.Id);

        var foreign = await client.PostAsJsonAsync(
            Boards, new IdeaBoardRequest("Mixed", universe.Id, [IdeaCard(elsewhere.Id)], [], null));
        Assert.Contains("another universe", await Errors(foreign), StringComparison.Ordinal);

        var board = await Create(client, "Plot", universeId: universe.Id, cards: [IdeaCard(own.Id), IdeaCard(unassigned.Id)]);
        Assert.Equal(["Own", "Unassigned"], board.Cards.Select(card => card.Name));

        // An unassigned board takes any of the owner's ideas.
        var anywhere = await Create(client, "Anywhere", cards: [IdeaCard(elsewhere.Id)]);
        Assert.Single(anywhere.Cards);

        (await client.DeleteAsync(Idea(own.Id))).EnsureSuccessStatusCode();
        var marked = await Read(client, board.Id);
        Assert.Equal([true, false], marked.Cards.Select(card => card.IsGone));
        await Save(client, marked, title: "Plot, kept");

        var deleted = await CreateIdea(client, "Deleted first", universeId: universe.Id);
        (await client.DeleteAsync(Idea(deleted.Id))).EnsureSuccessStatusCode();
        var refused = await TrySave(client, await Read(client, board.Id), cards: [IdeaCard(deleted.Id)]);
        Assert.Contains("deleted idea", await Errors(refused), StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_shape_of_a_board_is_held_to_its_bounds()
    {
        var client = await SignedIn(_factory, "user-boardshape");
        var a = Note(0, 0);
        var b = Note(300, 0);

        async Task<string> Refusal(IdeaBoardRequest request) => await Errors(await client.PostAsJsonAsync(Boards, request));

        Assert.Contains("title", await Refusal(new IdeaBoardRequest("  ", null, [], [], null)), StringComparison.Ordinal);
        Assert.Contains("different cards", await Refusal(new IdeaBoardRequest("Self", null, [a], [Line(a, a)], null)), StringComparison.Ordinal);
        Assert.Contains("different cards", await Refusal(new IdeaBoardRequest("Dangling", null, [a], [Line(a, b)], null)), StringComparison.Ordinal);
        Assert.Contains("at most", await Refusal(new IdeaBoardRequest("Twice", null, [a, b], [Line(a, b), Line(b, a)], null)), StringComparison.Ordinal);
        Assert.Contains("share an id", await Refusal(new IdeaBoardRequest("Twins", null, [a, a with { X = 9 }], [], null)), StringComparison.Ordinal);
        Assert.Contains("outside", await Refusal(new IdeaBoardRequest("Far", null, [a with { X = 2_000_000 }], [], null)), StringComparison.Ordinal);
        Assert.Contains("outside", await Refusal(new IdeaBoardRequest("Tiny", null, [a with { Width = 10 }], [], null)), StringComparison.Ordinal);
        Assert.Contains("only that", await Refusal(new IdeaBoardRequest("Both", null, [a with { IdeaId = Guid.NewGuid() }], [], null)), StringComparison.Ordinal);
        Assert.Contains("only that", await Refusal(new IdeaBoardRequest("Empty idea", null, [a with { Kind = IdeaBoardCardKind.Idea, Text = null }], [], null)), StringComparison.Ordinal);
        Assert.Contains("note", await Refusal(new IdeaBoardRequest("Long", null, [a with { Text = new string('n', IdeaBoardLimits.NoteMaxLength + 1) }], [], null)), StringComparison.Ordinal);

        var tooMany = Enumerable.Range(0, IdeaBoardLimits.MaxCards + 1).Select(i => Note(i, 0)).ToList();
        Assert.Contains("up to", await Refusal(new IdeaBoardRequest("Crowded", null, tooMany, [], null)), StringComparison.Ordinal);

        // A note with no text is an empty note, and at the bound everything is accepted.
        var full = Enumerable.Range(0, IdeaBoardLimits.MaxCards).Select(i => Note(i * 10, 0) with { Text = null }).ToList();
        var board = await Create(client, "Full", cards: full);
        Assert.All(board.Cards, card => Assert.Equal(string.Empty, card.Text));
    }

    [Fact]
    public async Task A_stale_save_is_refused_and_a_save_that_changes_nothing_writes_nothing()
    {
        var client = await SignedIn(_factory, "user-boardstale");
        var note = Note(0, 0, "First");
        var board = await Create(client, "Stale", cards: [note]);

        var unchanged = await Save(client, board);
        Assert.Equal(board.UpdatedAt, unchanged.UpdatedAt);

        var moved = await Save(client, board, cards: [note with { X = 50 }]);
        Assert.True(moved.UpdatedAt > board.UpdatedAt);

        var stale = await TrySave(client, board, title: "From the other tab");
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var problem = JsonDocument.Parse(await stale.Content.ReadAsStringAsync());
        Assert.Equal(IdeaBoardEndpoints.ChangedCode, problem.RootElement.GetProperty("code").GetString());
        Assert.Equal("Stale", (await Read(client, board.Id)).Title);
        Assert.Equal(50, (await Read(client, board.Id)).Cards[0].X);
    }

    [Fact]
    public async Task Boards_are_listed_filtered_deleted_and_restored_whole()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "boardlist");
        var a = Note(0, 0);
        var b = Note(300, 0);
        var inWorld = await Create(client, "In the world", universeId: universe.Id, cards: [a, b], connections: [Line(a, b)]);
        await Create(client, "Loose board");

        Assert.Equal(["Loose board", "In the world"], (await List(client)).Items.Select(item => item.Title));
        Assert.Equal(["In the world"], (await List(client, $"?universeId={universe.Id}")).Items.Select(item => item.Title));
        Assert.Equal(["Loose board"], (await List(client, "?unassigned=true")).Items.Select(item => item.Title));
        Assert.Equal(["In the world"], (await List(client, "?search=WORLD")).Items.Select(item => item.Title));
        Assert.Equal(2, (await List(client, $"?universeId={universe.Id}")).Items.Single().CardCount);

        (await client.DeleteAsync($"{Boards}/{inWorld.Id}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Boards}/{inWorld.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{Boards}/{inWorld.Id}")).StatusCode);
        Assert.Equal(["In the world"], (await List(client, "?deleted=true")).Items.Select(item => item.Title));

        var restored = await (await client.PostAsync($"{Boards}/{inWorld.Id}/restore", null)).Content.ReadFromJsonAsync<IdeaBoardDetail>();
        Assert.Equal(inWorld, restored, BoardComparer.Instance);
    }

    [Fact]
    public async Task Deleting_the_universe_keeps_its_boards_unassigned_without_their_entry_cards()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "boarduniverse");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var idea = await CreateIdea(client, "Arlen's secret", universeId: universe.Id);

        var note = Note(0, 0, "Kept");
        var ideaCard = IdeaCard(idea.Id, 300, 0);
        var entry = EntryCard(arlen, 600, 0);
        var board = await Create(
            client,
            "Survives",
            universeId: universe.Id,
            cards: [note, ideaCard, entry],
            connections: [Line(note, ideaCard), Line(ideaCard, entry)]);

        await DeleteUniverse(client, universe.Id);

        var after = await Read(client, board.Id);
        Assert.Null(after.Universe);
        Assert.True(after.UpdatedAt > board.UpdatedAt);
        Assert.Equal([note.Id, ideaCard.Id], after.Cards.Select(card => card.Id));
        Assert.Equal((note.Id, ideaCard.Id), (Assert.Single(after.Connections).FromCardId, after.Connections[0].ToCardId));

        // A window still holding the old universe saves as stale.
        Assert.Equal(HttpStatusCode.Conflict, (await TrySave(client, board, title: "Old window")).StatusCode);

        await WithDb(_factory, async db =>
            Assert.Equal(0, await db.IdeaBoardCards.CountAsync(card => card.EntityId == arlen)));
    }

    // ---------- Steps ----------

    private static IdeaBoardCardInput Note(double x, double y, string? text = "") =>
        new(Guid.NewGuid(), IdeaBoardCardKind.Note, x, y, 200, 120, text, null, null);

    private static IdeaBoardCardInput IdeaCard(Guid ideaId, double x = 0, double y = 0) =>
        new(Guid.NewGuid(), IdeaBoardCardKind.Idea, x, y, 220, 140, null, ideaId, null);

    private static IdeaBoardCardInput EntryCard(Guid entityId, double x = 0, double y = 0) =>
        new(Guid.NewGuid(), IdeaBoardCardKind.Entity, x, y, 220, 100, null, null, entityId);

    private static IdeaBoardConnectionInput Line(IdeaBoardCardInput from, IdeaBoardCardInput to, string? label = null) =>
        new(Guid.NewGuid(), from.Id, to.Id, label);

    private static List<IdeaBoardCardInput> Inputs(IdeaBoardDetail board) =>
        [.. board.Cards.Select(card => new IdeaBoardCardInput(
            card.Id, card.Kind, card.X, card.Y, card.Width, card.Height, card.Text, card.IdeaId, card.EntityId))];

    private static IdeaBoardRequest Request(
        IdeaBoardDetail board,
        string? title = null,
        Optional<Guid?> universeId = default,
        IReadOnlyList<IdeaBoardCardInput>? cards = null) =>
        new(
            title ?? board.Title,
            universeId.HasValue ? universeId.Value : board.Universe?.Id,
            cards ?? Inputs(board),
            cards is null ? board.Connections : [],
            board.UpdatedAt);

    private static async Task<IdeaBoardDetail> Create(
        HttpClient client,
        string title,
        Guid? universeId = null,
        IReadOnlyList<IdeaBoardCardInput>? cards = null,
        IReadOnlyList<IdeaBoardConnectionInput>? connections = null)
    {
        var response = await client.PostAsJsonAsync(Boards, new IdeaBoardRequest(title, universeId, cards, connections, null));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<IdeaBoardDetail>())!;
    }

    private static Task<HttpResponseMessage> TrySave(
        HttpClient client,
        IdeaBoardDetail board,
        string? title = null,
        Optional<Guid?> universeId = default,
        IReadOnlyList<IdeaBoardCardInput>? cards = null) =>
        client.PutAsJsonAsync($"{Boards}/{board.Id}", Request(board, title, universeId, cards));

    private static async Task<IdeaBoardDetail> Save(
        HttpClient client,
        IdeaBoardDetail board,
        string? title = null,
        IReadOnlyList<IdeaBoardCardInput>? cards = null)
    {
        var response = await TrySave(client, board, title, cards: cards);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<IdeaBoardDetail>())!;
    }

    private static async Task<IdeaBoardDetail> Read(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<IdeaBoardDetail>($"{Boards}/{id}"))!;

    private static async Task<IdeaBoardPage> List(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<IdeaBoardPage>($"{Boards}{query}"))!;

    /// <summary>Two reads of one board are the same board: records holding lists compare those lists by reference.</summary>
    private sealed class BoardComparer : IEqualityComparer<IdeaBoardDetail?>
    {
        public static readonly BoardComparer Instance = new();

        private static readonly IdeaBoardCardView[] NoCards = [];

        private static readonly IdeaBoardConnectionInput[] NoLines = [];

        public bool Equals(IdeaBoardDetail? x, IdeaBoardDetail? y) =>
            x is not null && y is not null
            && x with { Cards = NoCards, Connections = NoLines } == y with { Cards = NoCards, Connections = NoLines }
            && x.Cards.SequenceEqual(y.Cards)
            && x.Connections.SequenceEqual(y.Connections);

        public int GetHashCode(IdeaBoardDetail? obj) => obj?.Id.GetHashCode() ?? 0;
    }
}
