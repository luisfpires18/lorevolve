namespace Lorex.Api.Features.Lore;

/// <summary>
/// One save of an entry's private note (issue 23). <paramref name="Content"/> is the whole text, stored exactly; an empty
/// string clears it; null is refused, so a malformed body can never wipe a note. <paramref name="ExpectedVersion"/> is the
/// <c>version</c> the last read or save answered - 0 when nothing was saved yet; anything else is refused with 409
/// <c>entity_private_note_changed</c> and nothing is written (ADR 0043).
/// </summary>
public sealed record EntityPrivateNoteRequest(string? Content, int? ExpectedVersion);

/// <summary>
/// An entry's private note. <paramref name="Content"/> is <c>""</c> and <paramref name="UpdatedAt"/> null for an entry with
/// no note yet, so a client sees one shape; <paramref name="Version"/> is what the next save names, 0 until then.
/// </summary>
public sealed record EntityPrivateNoteResponse(Guid EntityId, string Content, DateTime? UpdatedAt, int Version);
