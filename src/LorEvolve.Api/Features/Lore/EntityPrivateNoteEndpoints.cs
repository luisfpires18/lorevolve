using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The owner's private note on an entry (issue 23), read and written on its own address and nowhere else.
///
/// Both routes ask for <see cref="UniverseCapability.PrivateNotes"/>, which the owner alone holds: a member of any other
/// role is told 403 with the one refusal every capability uses, and nothing of the note; an outsider is told 404, as for
/// the universe itself. Then a live entry of that universe, else 404 - a trashed entry's note is kept and unreachable, like
/// its article. Validation runs after both, so a malformed body learns nothing.
///
/// A save passes no Canon gate, records no revision, moves no <c>UpdatedAt</c> of the entry and touches no index: a note is
/// about the entry, not part of it. The version comparison is the manuscript's (ADR 0043), inside the write's own
/// transaction.
/// </summary>
public static class EntityPrivateNoteEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over a note that has since changed.</summary>
    public const string ChangedCode = "entity_private_note_changed";

    public static IEndpointRouteBuilder MapEntityPrivateNoteEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/universes/{universeId:guid}/entities/{entityId:guid}/private-note")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", GetAsync).WithName("GetEntityPrivateNote");
        group.MapPut("/", SaveAsync).WithName("SaveEntityPrivateNote");

        return endpoints;
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.PrivateNotes, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (!await IsLiveAsync(db, universeId, entityId, cancellationToken))
        {
            return Results.NotFound();
        }

        var stored = await db.EntityPrivateNotes.AsNoTracking()
            .Where(note => note.EntityId == entityId)
            .Select(note => new { note.Content, note.UpdatedAt, note.Version })
            .FirstOrDefaultAsync(cancellationToken);

        return Results.Ok(stored is null
            ? new EntityPrivateNoteResponse(entityId, string.Empty, null, 0)
            : new EntityPrivateNoteResponse(entityId, stored.Content, Utc(stored.UpdatedAt), stored.Version));
    }

    private static async Task<IResult> SaveAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] EntityPrivateNoteRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.PrivateNotes, cancellationToken) is { } denied)
        {
            return denied;
        }

        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (!await IsLiveAsync(db, universeId, entityId, cancellationToken))
        {
            return Results.NotFound();
        }

        if (Validate(request.Content) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var note = await db.EntityPrivateNotes.FirstOrDefaultAsync(row => row.EntityId == entityId, cancellationToken);
        var version = note?.Version ?? 0;

        if (!EditVersion.Matches(version, request.ExpectedVersion))
        {
            return EditVersion.Changed(
                ChangedCode,
                "Note changed",
                "This note was saved somewhere else since you opened it. Read the latest before saving over it.",
                version);
        }

        var content = request.Content!;

        if (string.Equals(note?.Content ?? string.Empty, content, StringComparison.Ordinal) && note is not null)
        {
            return Results.Ok(new EntityPrivateNoteResponse(entityId, note.Content, Utc(note.UpdatedAt), note.Version));
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
            note.Version = version + 1;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new EntityPrivateNoteResponse(entityId, note.Content, Utc(note.UpdatedAt), note.Version));
    }

    private static Dictionary<string, string[]>? Validate(string? content)
    {
        if (content is null)
        {
            return new Dictionary<string, string[]> { ["content"] = ["Send the note. An empty one clears it."] };
        }

        if (content.Length > PrivateNoteLimits.ContentMaxLength)
        {
            return new Dictionary<string, string[]>
            {
                ["content"] = [$"A note is at most {PrivateNoteLimits.ContentMaxLength:N0} characters."],
            };
        }

        return null;
    }

    private static Task<bool> IsLiveAsync(LorEvolveDbContext db, Guid universeId, Guid entityId, CancellationToken cancellationToken) =>
        db.Entities.AnyAsync(entity => entity.Id == entityId && entity.UniverseId == universeId && entity.DeletedAt == null, cancellationToken);

    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
