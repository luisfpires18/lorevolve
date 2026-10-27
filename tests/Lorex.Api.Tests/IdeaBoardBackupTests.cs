using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Restore;
using static Lorex.Api.Tests.IdeaTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Idea boards in the backup: format version 36 (ADR 0014, ADR 0066).
///
/// Every board that belongs to the universe travels - cards in draw order, lines, deleted ones marked after the live ones -
/// and no other board does. An idea card whose idea the file does not hold carries that idea's title: the restoring account
/// gets its own idea linked back when it still has it, and a note with the title otherwise. A version 35 file restores no
/// board, and a file whose lines or cards point nowhere is refused.
/// </summary>
public sealed class IdeaBoardBackupTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Boards = "/api/idea-boards";

    private readonly LorexApiFactory _factory = factory;

    [Fact]
    public async Task A_universes_boards_travel_whole_and_an_outside_idea_carries_its_title()
    {
        var world = await World("boardexport");

        var backup = JsonSerializer.Deserialize<UniverseBackup>(
            DocumentText(await RawArchive(world.Client, world.Universe)), UniverseBackupJson.Options)!;
        Assert.Equal(36, backup.FormatVersion);

        var boards = backup.Payload.IdeaBoards!;
        Assert.Equal([("Plot board", false), ("Binned board", true)], boards.Select(board => (board.Title, board.DeletedAt is not null)));

        var plot = boards[0];
        Assert.Equal(world.Board.Cards.Select(card => card.Id), plot.Cards.Select(card => card.Id));
        Assert.Equal(
            [IdeaBoardCardKind.Note, IdeaBoardCardKind.Idea, IdeaBoardCardKind.Idea, IdeaBoardCardKind.Entity],
            plot.Cards.Select(card => card.Kind));
        Assert.Equal([null, null, "Loose thought", null], plot.Cards.Select(card => card.OutsideIdeaTitle));
        Assert.Equal((-40.5, 12.25), (plot.Cards[0].X, plot.Cards[0].Y));
        Assert.Equal(2, plot.Connections.Count);
        Assert.Contains(plot.Connections, connection => connection.Label == "why?");

        // Unchanged boards write unchanged bytes.
        Assert.Equal(
            PayloadText(DocumentText(await RawArchive(world.Client, world.Universe))),
            PayloadText(DocumentText(await RawArchive(world.Client, world.Universe))));
    }

    [Fact]
    public async Task The_same_account_gets_its_outside_idea_linked_back_and_everything_else_restored_new()
    {
        var world = await World("boardrestore");

        var restored = await RestoreArchive(world.Client, await RawArchive(world.Client, world.Universe), "Restored boardrestore");

        var list = (await world.Client.GetFromJsonAsync<IdeaBoardPage>($"{Boards}?universeId={restored.Id}"))!;
        var row = Assert.Single(list.Items);
        Assert.NotEqual(world.Board.Id, row.Id);
        Assert.Single((await world.Client.GetFromJsonAsync<IdeaBoardPage>($"{Boards}?universeId={restored.Id}&deleted=true"))!.Items);

        var board = (await world.Client.GetFromJsonAsync<IdeaBoardDetail>($"{Boards}/{row.Id}"))!;
        Assert.Equal(restored.Id, board.Universe!.Id);
        Assert.Equal(world.Board.Cards.Select(card => card.Id), board.Cards.Select(card => card.Id));
        Assert.Equal(world.Board.Connections.OrderBy(c => c.Id), board.Connections.OrderBy(c => c.Id));

        // The universe's own idea is the restored copy; the unassigned one is the account's original.
        Assert.NotEqual(world.OwnIdea, board.Cards[1].IdeaId);
        Assert.Equal("Arlen's secret", board.Cards[1].Name);
        Assert.Equal(world.LooseIdea, board.Cards[2].IdeaId);
        Assert.Equal(("Arlen", false), (board.Cards[3].Name, board.Cards[3].IsGone));
        Assert.NotEqual(world.Entity, board.Cards[3].EntityId);
    }

    [Fact]
    public async Task Another_account_keeps_an_outside_idea_as_a_note_with_its_title()
    {
        var world = await World("boardstranger");
        var stranger = await SignedIn(_factory, "user-boardstranger-restore");

        var restored = await RestoreArchive(stranger, await RawArchive(world.Client, world.Universe), "Theirs boardstranger");

        var row = Assert.Single((await stranger.GetFromJsonAsync<IdeaBoardPage>($"{Boards}?universeId={restored.Id}"))!.Items);
        var board = (await stranger.GetFromJsonAsync<IdeaBoardDetail>($"{Boards}/{row.Id}"))!;

        Assert.Equal(
            [IdeaBoardCardKind.Note, IdeaBoardCardKind.Idea, IdeaBoardCardKind.Note, IdeaBoardCardKind.Entity],
            board.Cards.Select(card => card.Kind));
        Assert.Equal("Loose thought", board.Cards[2].Text);
        Assert.Equal(2, board.Connections.Count);
    }

    [Fact]
    public async Task A_version_35_file_restores_no_board_and_a_broken_board_is_refused()
    {
        var world = await World("boardolder");
        var archive = await RawArchive(world.Client, world.Universe);

        var older = await RestoreArchive(world.Client, Rewrite(archive, root => root["formatVersion"] = 35), "Older boardolder");
        Assert.Empty((await world.Client.GetFromJsonAsync<IdeaBoardPage>($"{Boards}?universeId={older.Id}"))!.Items);

        var dangling = Rewrite(archive, root =>
            Board(root)["connections"]![0]!["toCardId"] = Guid.NewGuid().ToString());
        Assert.Contains(BackupIssueCodes.MissingReference, (await Refused(await Validate(world.Client, dangling))).IssueCodes);

        var untitled = Rewrite(archive, root =>
            Board(root)["cards"]![2]!["outsideIdeaTitle"] = null);
        Assert.Contains(BackupIssueCodes.MissingMember, (await Refused(await Validate(world.Client, untitled))).IssueCodes);

        var twoThings = Rewrite(archive, root =>
            Board(root)["cards"]![0]!["entityId"] = world.Entity.ToString());
        Assert.Contains(BackupIssueCodes.InvalidValue, (await Refused(await Validate(world.Client, twoThings))).IssueCodes);
    }

    // ---------- The world ----------

    private sealed record Seeded(HttpClient Client, Guid Universe, Guid Entity, Guid OwnIdea, Guid LooseIdea, IdeaBoardDetail Board);

    /// <summary>
    /// A universe with one live board - a note, its own idea, an unassigned idea and an entry, two lines - and one deleted
    /// board; plus an unassigned board and another universe's board, neither of which belongs in its file.
    /// </summary>
    private async Task<Seeded> World(string tag)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, tag);
        var other = await CreateUniverse(client, $"Other {tag}");
        var arlen = await CreateEntity(client, universe.Id, "Arlen");
        var own = await CreateIdea(client, "Arlen's secret", universeId: universe.Id);
        var loose = await CreateIdea(client, "Loose thought");

        var note = Card(IdeaBoardCardKind.Note, -40.5, 12.25, text: "Underside");
        var ownCard = Card(IdeaBoardCardKind.Idea, 300, 0, ideaId: own.Id);
        var looseCard = Card(IdeaBoardCardKind.Idea, 600, 0, ideaId: loose.Id);
        var entry = Card(IdeaBoardCardKind.Entity, 900, 0, entityId: arlen);
        var board = await Create(
            client,
            new IdeaBoardRequest(
                "Plot board",
                universe.Id,
                [note, ownCard, looseCard, entry],
                [new(Guid.NewGuid(), note.Id, ownCard.Id, "why?"), new(Guid.NewGuid(), looseCard.Id, entry.Id, null)],
                null));

        var binned = await Create(client, new IdeaBoardRequest("Binned board", universe.Id, [Card(IdeaBoardCardKind.Note, 0, 0, text: "")], [], null));
        (await client.DeleteAsync($"{Boards}/{binned.Id}")).EnsureSuccessStatusCode();

        await Create(client, new IdeaBoardRequest("Unassigned board", null, [], [], null));
        await Create(client, new IdeaBoardRequest("Other world's board", other.Id, [], [], null));

        return new Seeded(client, universe.Id, arlen, own.Id, loose.Id, board);
    }

    private static IdeaBoardCardInput Card(
        IdeaBoardCardKind kind, double x, double y, string? text = null, Guid? ideaId = null, Guid? entityId = null) =>
        new(Guid.NewGuid(), kind, x, y, 200, 120, text, ideaId, entityId);

    private static async Task<IdeaBoardDetail> Create(HttpClient client, IdeaBoardRequest request)
    {
        var response = await client.PostAsJsonAsync(Boards, request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<IdeaBoardDetail>())!;
    }

    private static System.Text.Json.Nodes.JsonObject Board(System.Text.Json.Nodes.JsonObject root) =>
        Payload(root)["ideaBoards"]![0]!.AsObject();
}
