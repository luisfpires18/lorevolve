using System.ComponentModel;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using static LorEvolve.Api.Features.Mcp.McpResults;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// The owner's private note over MCP: a connected app adds text to the note on one lore entry, at the owner's request.
///
/// <para><b>Add only, never read.</b> The tool appends to the note and answers with its new version and length, never its
/// text, so a note the owner wrote in LorEvolve does not flow back to the app, and nothing the app adds can replace or
/// remove what is there. Reading and rewriting the note stay in LorEvolve (<see cref="EntityPrivateNoteEndpoints"/>).</para>
///
/// <para><b>Gated twice.</b> It writes, so it is listed with the proposal tools (<see cref="ProposeGated"/>): a connection
/// the person did not let write never sees it. And the note is the owner's alone, so a call from any other role is
/// refused, exactly as the note's own route refuses it (<see cref="UniverseCapability.PrivateNotes"/>). The universe is
/// the connection's; a trashed or foreign entry is not found.</para>
/// </summary>
[McpServerToolType]
public sealed class LorEvolveMcpPrivateNoteTools(LorEvolveDbContext db, McpCaller caller)
{
    public const string AddTool = "add_private_note";

    /// <summary>Listed beside the proposal tools in <see cref="LorEvolveMcpProposalTools"/>'s gate, so a read-only connection never sees it.</summary>
    public static readonly string[] ProposeGated = [AddTool];

    /// <summary>Put between what is already in a note and what is added to it.</summary>
    public const string Separator = "\n\n";

    /// <summary>What a client is told about this tool, added to the server's instructions.</summary>
    public const string Instructions =
        " Private notes: add_private_note adds text to the universe owner's private note on one lore entry - author-only "
        + "context no other member sees. Use it only when the person asks you to note something. It adds after what is "
        + "there and never shows, replaces or removes the existing note.";

    [McpServerTool(Name = AddTool, Title = "Add to an entry's private note", ReadOnly = false, Destructive = false, Idempotent = false, OpenWorld = false)]
    [Description("Add text to the owner's private note on one lore entry: author-only context, such as a reveal still to come, that "
        + "no other member of the universe sees. Only the universe's owner has private notes. The text is added after the existing "
        + "note, separated by a blank line; the existing note is never shown, replaced or removed. Use it only when the person asks "
        + "you to note something. It is not lore: it changes nothing in the entry and is not reviewed.")]
    public async Task<CallToolResult> AddPrivateNoteAsync(
        [Description("The lore entry's id, as get_lore_entry or search_universe gave it.")] string? loreId,
        [Description("The text to add, exactly as it should be kept.")] string? text,
        CancellationToken cancellationToken = default)
    {
        if (Guard(caller) is { } refused)
        {
            return refused;
        }

        // The gate filter refuses a connection that may not write before this runs; checked again so the tool holds alone.
        var role = caller.CanPropose ? await UniverseAccess.RoleAsync(db, caller.UniverseId, caller.UserId, cancellationToken) : null;
        if (role is not { } effective || !UniverseAccess.Allows(effective, UniverseCapability.PrivateNotes))
        {
            return Error("not_allowed", "Only the universe's owner has private notes, through a connection allowed to write.");
        }

        if (!Guid.TryParse(loreId, out var entityId))
        {
            return NotFound("No lore entry with that id is in this universe.");
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return Error("invalid_note", "Send the text to add. Nothing was written.");
        }

        // One transaction for the read and the write, as the note's own route does it: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await LoreEntries.IsLiveAsync(db, caller.UniverseId, entityId, cancellationToken))
        {
            return NotFound("No lore entry with that id is in this universe.");
        }

        var note = await db.EntityPrivateNotes.FirstOrDefaultAsync(row => row.EntityId == entityId, cancellationToken);
        var existing = note?.Content ?? string.Empty;
        var content = existing.Length == 0 ? text : existing + Separator + text;

        if (content.Length > PrivateNoteLimits.ContentMaxLength)
        {
            return Error(
                "note_too_long",
                $"A note is at most {PrivateNoteLimits.ContentMaxLength:N0} characters; adding this would make it {content.Length:N0}. Nothing was written.");
        }

        var now = DateTime.UtcNow;
        if (note is null)
        {
            note = new EntityPrivateNote { EntityId = entityId, Content = content, UpdatedAt = now, Version = 1 };
            db.EntityPrivateNotes.Add(note);
        }
        else
        {
            note.Content = content;
            note.UpdatedAt = now;
            note.Version++;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Result(new
        {
            loreId = entityId,
            version = note.Version,
            length = note.Content.Length,
            message = "Added to the private note. Only the owner sees it, on the entry in LorEvolve.",
        });
    }
}
