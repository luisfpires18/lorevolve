using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Reading;
using Lorex.Api.Features.Search;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;
using static Lorex.Api.Tests.PublishingTestClient;
using static Lorex.Api.Tests.RestoreTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// The owner's private note on an entry (issue 23, ADR 0056): written, read, emptied and kept exactly by the owner alone;
/// refused to every other role and hidden from an outsider; protected by its version; part of nothing else the entry
/// answers - not its read, its history, Lore's search, the universe search, the public page or the assistant's reader -
/// and carried only in the owner's backup.
/// </summary>
public sealed class EntityPrivateNoteTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    private static string Note(Guid universeId, Guid entityId) => $"/api/universes/{universeId}/entities/{entityId}/private-note";

    private static Task<HttpResponseMessage> Put(HttpClient client, Guid u, Guid e, string? content, int? version) =>
        client.PutAsJsonAsync(Note(u, e), new EntityPrivateNoteRequest(content, version));

    private static async Task<EntityPrivateNoteResponse> Saved(HttpClient client, Guid u, Guid e, string content, int version)
    {
        var response = await Put(client, u, e, content, version);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<EntityPrivateNoteResponse>())!;
    }

    private static async Task<EntityPrivateNoteResponse> Read(HttpClient client, Guid u, Guid e) =>
        (await client.GetFromJsonAsync<EntityPrivateNoteResponse>(Note(u, e)))!;

    [Fact]
    public async Task The_owner_writes_reads_empties_and_keeps_a_note_exactly()
    {
        var w = await NewSharedWorld(_factory, "pn-owner");
        var before = DateTime.UtcNow.AddSeconds(-5);

        var empty = await Read(w.Owner, w.U, w.Entry);
        Assert.Equal(new EntityPrivateNoteResponse(w.Entry, string.Empty, null, 0), empty);

        const string text = "  Keep the twin a secret.\n\n  Reveal it in act three — not before.  ";
        var saved = await Saved(w.Owner, w.U, w.Entry, text, 0);
        Assert.Equal(text, saved.Content);
        Assert.Equal(1, saved.Version);
        Assert.NotNull(saved.UpdatedAt);
        Assert.Equal(DateTimeKind.Utc, saved.UpdatedAt!.Value.Kind);
        Assert.InRange(saved.UpdatedAt.Value, before, DateTime.UtcNow.AddSeconds(5));
        Assert.Equal(saved, await Read(w.Owner, w.U, w.Entry));

        // A save that changes nothing writes nothing: same version, same moment.
        var same = await Saved(w.Owner, w.U, w.Entry, text, 1);
        Assert.Equal(saved, same);

        // Emptying is a save like any other, and the row stays.
        var cleared = await Saved(w.Owner, w.U, w.Entry, string.Empty, 1);
        Assert.Equal(string.Empty, cleared.Content);
        Assert.Equal(2, cleared.Version);
        Assert.NotNull(cleared.UpdatedAt);
        Assert.Equal(cleared, await Read(w.Owner, w.U, w.Entry));
        await WithDb(_factory, async db => Assert.Equal(1, await db.EntityPrivateNotes.CountAsync(note => note.EntityId == w.Entry)));
    }

    [Fact]
    public async Task A_note_is_the_owners_alone()
    {
        var w = await NewSharedWorld(_factory, "pn-roles");
        const string text = "Only the owner reads this.";
        await Saved(w.Owner, w.U, w.Entry, text, 0);

        foreach (var who in new[] { Who.Editor, Who.Reviewer, Who.Viewer })
        {
            var read = await w.Client(who).GetAsync(Note(w.U, w.Entry));
            await AssertDenied(read, $"{who} reads a note");
            Assert.DoesNotContain(text, await read.Content.ReadAsStringAsync(), StringComparison.Ordinal);

            await AssertDenied(await Put(w.Client(who), w.U, w.Entry, "Mine now.", 1), $"{who} writes a note");
        }

        await AssertHidden(await w.Outsider.GetAsync(Note(w.U, w.Entry)), "outsider reads a note");
        await AssertHidden(await Put(w.Outsider, w.U, w.Entry, "Mine now.", 1), "outsider writes a note");

        // An entry reached through another universe, or made up, is missing.
        var other = (await CreateUniverse(w.Owner, "Another noted world")).Id;
        await AssertHidden(await w.Owner.GetAsync(Note(other, w.Entry)), "entry under another universe");
        await AssertHidden(await w.Owner.GetAsync(Note(w.U, Guid.NewGuid())), "a guessed entry");
        await AssertHidden(await Put(w.Owner, other, w.Entry, "Mine.", 0), "write under another universe");

        // Nothing was written by any refusal.
        Assert.Equal(text, (await Read(w.Owner, w.U, w.Entry)).Content);
        await WithDb(_factory, async db => Assert.Equal(1, await db.EntityPrivateNotes.CountAsync(note => note.EntityId == w.Entry)));
    }

    [Fact]
    public async Task A_stale_or_missing_version_is_refused_and_nothing_is_written()
    {
        var w = await NewSharedWorld(_factory, "pn-version");
        await Saved(w.Owner, w.U, w.Entry, "First.", 0);

        foreach (var stale in new int?[] { 0, 2, 5, null })
        {
            var response = await Put(w.Owner, w.U, w.Entry, "Second.", stale);
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync();
            using var problem = JsonDocument.Parse(body);
            Assert.Equal(EntityPrivateNoteEndpoints.ChangedCode, problem.RootElement.GetProperty("code").GetString());
            Assert.Equal(1, problem.RootElement.GetProperty("currentVersion").GetInt32());
            Assert.DoesNotContain("First.", body, StringComparison.Ordinal);
        }

        var stored = await Read(w.Owner, w.U, w.Entry);
        Assert.Equal("First.", stored.Content);
        Assert.Equal(1, stored.Version);

        // The right version goes through, and moves it on once.
        Assert.Equal(2, (await Saved(w.Owner, w.U, w.Entry, "Second.", 1)).Version);
    }

    [Fact]
    public async Task A_malformed_or_over_long_note_is_refused()
    {
        var w = await NewSharedWorld(_factory, "pn-shape");

        var missing = await Put(w.Owner, w.U, w.Entry, null, 0);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Contains("content", await ErrorKeys(missing));

        var tooLong = await Put(w.Owner, w.U, w.Entry, new string('x', PrivateNoteLimits.ContentMaxLength + 1), 0);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Contains("content", await ErrorKeys(tooLong));

        // Exactly the bound is kept.
        var atBound = new string('y', PrivateNoteLimits.ContentMaxLength);
        Assert.Equal(atBound, (await Saved(w.Owner, w.U, w.Entry, atBound, 0)).Content);

        // A member's malformed body is still just refused for the role, never validated.
        await AssertDenied(await Put(w.Editor, w.U, w.Entry, null, 0), "editor malformed");
        await AssertHidden(await Put(w.Outsider, w.U, w.Entry, null, 0), "outsider malformed");
    }

    [Fact]
    public async Task A_note_changes_nothing_about_the_entry_and_reaches_no_other_read()
    {
        var w = await NewSharedWorld(_factory, "pn-apart");
        var u = $"/api/universes/{w.U}";
        var secret = $"Zyrrakhan-{Guid.NewGuid():n}";

        var entryBefore = (await w.Owner.GetFromJsonAsync<EntityDetail>($"{u}/entities/{w.Entry}"))!;
        var revisionsBefore = await w.Owner.GetStringAsync($"{u}/entities/{w.Entry}/revisions");

        await Saved(w.Owner, w.U, w.Entry, $"{secret} is the real villain.", 0);

        var entryAfter = (await w.Owner.GetFromJsonAsync<EntityDetail>($"{u}/entities/{w.Entry}"))!;
        Assert.Equal(entryBefore.UpdatedAt, entryAfter.UpdatedAt);
        Assert.Equal(entryBefore.Version, entryAfter.Version);
        Assert.Equal(revisionsBefore, await w.Owner.GetStringAsync($"{u}/entities/{w.Entry}/revisions"));

        // Not in the entry, its list, Lore's search or the universe search - for the owner either.
        Assert.DoesNotContain(secret, await w.Owner.GetStringAsync($"{u}/entities/{w.Entry}"), StringComparison.Ordinal);
        Assert.DoesNotContain(secret, await w.Owner.GetStringAsync($"{u}/entities?pageSize=40"), StringComparison.Ordinal);
        var lore = (await w.Owner.GetFromJsonAsync<EntityPage>($"{u}/entities?search={secret}"))!;
        Assert.Empty(lore.Items);
        var everywhere = (await w.Owner.GetFromJsonAsync<UniverseSearchResponse>($"{u}/search?q={secret}"))!;
        Assert.Empty(everywhere.Results);

        // Not in what the assistant and MCP read through the shared reader (ADR 0045, 0046).
        await WithDb(_factory, async db =>
        {
            var reading = await UniverseReader.GetLoreAsync(db, w.U, w.Entry, CancellationToken.None);
            Assert.NotNull(reading);
            Assert.DoesNotContain(secret, JsonSerializer.Serialize(reading), StringComparison.Ordinal);
            var found = await UniverseReader.SearchAsync(db, w.U, secret, CancellationToken.None);
            Assert.Empty(found);
        });
    }

    [Fact]
    public async Task The_public_page_never_carries_a_note()
    {
        var (owner, _) = await Account(_factory, "pn-public");
        var universe = await Ready(owner, "Noted public world");
        var u = universe.Id;
        var entry = await CreateEntity(owner, u, "Salt Warden");
        var secret = $"Hidden-{Guid.NewGuid():n}";
        await Saved(owner, u, entry, $"{secret}: the warden is the heir.", 0);

        (await owner.PostAsync($"/api/universes/{u}/entities/{entry}/publish", null)).EnsureSuccessStatusCode();
        var world = await Published(owner, u);
        var anonymous = Anonymous(_factory);

        Assert.DoesNotContain(secret, await anonymous.GetStringAsync($"{PublicRoute}/{world.PublicSlug}/lore/salt-warden"), StringComparison.Ordinal);
        Assert.DoesNotContain(secret, await anonymous.GetStringAsync($"{PublicRoute}/{world.PublicSlug}/lore"), StringComparison.Ordinal);
        Assert.DoesNotContain(secret, await anonymous.GetStringAsync($"{PublicRoute}/{world.PublicSlug}"), StringComparison.Ordinal);

        // And the note's own route is not public.
        var response = await anonymous.GetAsync(Note(u, entry));
        Assert.True(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.NotFound or HttpStatusCode.Redirect, response.StatusCode.ToString());
    }

    [Fact]
    public async Task A_trashed_entry_keeps_its_note_unreachable_and_a_restore_brings_it_back()
    {
        var w = await NewSharedWorld(_factory, "pn-trash");
        var u = $"/api/universes/{w.U}";
        var saved = await Saved(w.Owner, w.U, w.Entry, "Kept through the Trash.", 0);

        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/entities/{w.Entry}")).StatusCode);
        await AssertHidden(await w.Owner.GetAsync(Note(w.U, w.Entry)), "note of a trashed entry");
        await AssertHidden(await Put(w.Owner, w.U, w.Entry, "Changed.", 1), "writing a trashed entry's note");
        await WithDb(_factory, async db => Assert.Equal(1, await db.EntityPrivateNotes.CountAsync(note => note.EntityId == w.Entry)));

        (await w.Owner.PostAsync($"{u}/trash/{w.Entry}/restore", null)).EnsureSuccessStatusCode();
        Assert.Equal(saved, await Read(w.Owner, w.U, w.Entry));

        // Erased for good, the note goes with the entry.
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"{u}/entities/{w.Entry}")).StatusCode);
        (await w.Owner.DeleteAsync($"{u}/trash/{w.Entry}")).EnsureSuccessStatusCode();
        await WithDb(_factory, async db => Assert.Equal(0, await db.EntityPrivateNotes.CountAsync(note => note.EntityId == w.Entry)));
    }

    [Fact]
    public async Task A_note_travels_in_the_owners_backup_and_restores_to_the_new_owner()
    {
        var w = await NewSharedWorld(_factory, "pn-backup");
        const string text = "Backed up, exactly.\n\n  With its spaces.  ";
        var saved = await Saved(w.Owner, w.U, w.Entry, text, 0);

        var backup = await Backup(w.Owner, w.U);
        Assert.Equal(UniverseBackup.CurrentVersion, backup.FormatVersion);
        Assert.Equal(33, backup.FormatVersion);
        var noted = backup.Payload.Entities.Single(entity => entity.Id == w.Entry);
        Assert.NotNull(noted.PrivateNote);
        Assert.Equal(text, noted.PrivateNote!.Content);
        Assert.Equal(saved.UpdatedAt, noted.PrivateNote.UpdatedAt);
        Assert.Null(backup.Payload.Entities.Single(entity => entity.Id == w.Other).PrivateNote);

        // Two exports of an unchanged world carry the same payload; only the envelope's moment differs.
        var archive = await RawArchive(w.Owner, w.U);
        Assert.Equal(
            JsonSerializer.Serialize(backup.Payload, UniverseBackupJson.Options),
            JsonSerializer.Serialize(BackupOf(archive).Payload, UniverseBackupJson.Options));

        // Restored, the note belongs to the new universe's owner, at version 1 again.
        var restored = await RestoreArchive(w.Owner, archive, "Noted again");
        var copy = (await w.Owner.GetFromJsonAsync<EntityPage>($"/api/universes/{restored.Id}/entities?search=Ember"))!.Items.Single();
        var restoredNote = await Read(w.Owner, restored.Id, copy.Id);
        Assert.Equal(text, restoredNote.Content);
        Assert.Equal(saved.UpdatedAt, restoredNote.UpdatedAt);
        Assert.Equal(1, restoredNote.Version);

        // A version 31 file has no note, even when it carries the member.
        var older = await RestoreArchive(w.Owner, Rewrite(archive, root => root["formatVersion"] = 31), "Noted before notes");
        var olderCopy = (await w.Owner.GetFromJsonAsync<EntityPage>($"/api/universes/{older.Id}/entities?search=Ember"))!.Items.Single();
        Assert.Equal(new EntityPrivateNoteResponse(olderCopy.Id, string.Empty, null, 0), await Read(w.Owner, older.Id, olderCopy.Id));

        // A note with no text, or too long a one, is refused before anything is written.
        var noText = Rewrite(archive, document: root => root["payload"]!["entities"]!.AsArray()
            .Single(entity => entity!["id"]!.GetValue<Guid>() == w.Entry)!["privateNote"]!["content"] = null);
        var refused = await Refused(await Validate(w.Owner, noText));
        Assert.Contains(refused.Issues, issue => issue.Message.Contains("private note", StringComparison.Ordinal));

        var tooLong = Rewrite(archive, document: root => root["payload"]!["entities"]!.AsArray()
            .Single(entity => entity!["id"]!.GetValue<Guid>() == w.Entry)!["privateNote"]!["content"] = new string('x', PrivateNoteLimits.ContentMaxLength + 1));
        refused = await Refused(await Validate(w.Owner, tooLong));
        Assert.Contains(refused.Issues, issue => issue.Message.Contains("private note", StringComparison.Ordinal));
    }
}
