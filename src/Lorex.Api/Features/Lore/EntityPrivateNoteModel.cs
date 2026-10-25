using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// The owner's private note on one entry (issue 23): production notes, a reveal still to come, author-only context that
/// must never appear anywhere but to the owner. Not an idea (account-owned possibilities, ADR 0030), not a comment (a
/// conversation among members, ADR 0041 amendment), not a field (part of the entry every member reads).
///
/// <b>Read by the owner alone, by construction.</b> It lives in its own row with no navigation from <see cref="LoreEntity"/>,
/// so no projection of an entry - the list, the read, search, the public page, the assistant's and MCP's reader, an AI
/// proposal, a suggestion, a revision - can carry it by accident: only its own route reads this table, behind the
/// <c>PrivateNotes</c> capability, which the owner alone holds. Nothing indexes it and nothing reads it for meaning.
///
/// <b>Plain text, kept exactly.</b> At most one per entry, keyed by the entry and deleted with it; a trashed entry's note is
/// kept and unreachable, like its article. The row appears on the first save and stays when a later save empties it. No
/// saved versions and no recovery copy on a device (owner decision): the one protection is the version a save names
/// (ADR 0043). It travels in the owner's backup (ADR 0014 amendment, version 32).
/// </summary>
public sealed class EntityPrivateNote
{
    /// <summary>The entry this is the note on: both the key and the foreign key.</summary>
    public Guid EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public required string Content { get; set; }

    /// <summary>UTC. When the note was last saved.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>Server-owned, 1 when created, advanced once by every save that changes the note (ADR 0043).</summary>
    public int Version { get; set; } = 1;
}

public static class PrivateNoteLimits
{
    public const int ContentMaxLength = 20_000;
}

public sealed class EntityPrivateNoteConfiguration : IEntityTypeConfiguration<EntityPrivateNote>
{
    public void Configure(EntityTypeBuilder<EntityPrivateNote> builder)
    {
        builder.ToTable("EntityPrivateNotes");
        builder.HasKey(note => note.EntityId);

        builder.Property(note => note.Content).IsRequired().HasMaxLength(PrivateNoteLimits.ContentMaxLength);

        // Owned by the entry and deleted with it, so with its universe too. Nothing on LoreEntity points back here: no
        // read or write of an entry can pull its note along.
        builder.HasOne(note => note.Entity)
            .WithOne()
            .HasForeignKey<EntityPrivateNote>(note => note.EntityId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
