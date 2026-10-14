using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Suggestions;

public enum SuggestionStatus
{
    Open = 0,
    Accepted = 1,
    Rejected = 2,
}

/// <summary>
/// A proposed change to one entry, story or scene (task 045, ADR 0044): review metadata, never the content. Exactly one of
/// <see cref="EntityId"/>, <see cref="StoryId"/> and <see cref="SceneId"/> is set, held by the database, each a cascading
/// key - like a comment thread's (ADR 0041 amendment, 043): the Trash leaves it in place, a permanent delete takes it.
///
/// It is bound to the target's edit <see cref="BaseVersion"/> (ADR 0043) it was proposed over. While the target still
/// holds that version, <see cref="Before"/> is exactly what is stored and <see cref="Proposed"/> is what an accept saves,
/// through the target's ordinary write path. Once the target moves on, the suggestion can still be read and rejected,
/// never accepted.
/// </summary>
public sealed class SuggestedChange
{
    public Guid Id { get; set; }

    public Guid? EntityId { get; set; }

    public LoreEntity? Entity { get; set; }

    public Guid? StoryId { get; set; }

    public Story? Story { get; set; }

    public Guid? SceneId { get; set; }

    public Scene? Scene { get; set; }

    /// <summary>The target's edit version the proposal was made against.</summary>
    public int BaseVersion { get; set; }

    /// <summary>
    /// The target's form as stored when the suggestion was made: the target kind's own snapshot record as JSON
    /// (<see cref="EntrySuggestion"/>, <see cref="StorySuggestion"/>, <see cref="SceneSuggestion"/>). Never changed.
    /// </summary>
    public required string Before { get; set; }

    /// <summary>The same form with the proposal applied, read back from the write path itself. Never changed.</summary>
    public required string Proposed { get; set; }

    public SuggestionStatus Status { get; set; }

    /// <summary>A raw account id with no foreign key, like a comment's author: it outlives the collaborator's membership.</summary>
    public required string ProposedByUserId { get; set; }

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Who accepted or rejected it, as on <see cref="ProposedByUserId"/>. Null while open.</summary>
    public string? ResolvedByUserId { get; set; }

    /// <summary>UTC. Null while open.</summary>
    public DateTime? ResolvedAt { get; set; }
}

public static class SuggestionLimits
{
    /// <summary>The most one list answers: open ones first, then the newest resolved.</summary>
    public const int ListMax = 100;
}

public sealed class SuggestedChangeConfiguration : IEntityTypeConfiguration<SuggestedChange>
{
    public void Configure(EntityTypeBuilder<SuggestedChange> builder)
    {
        builder.ToTable("SuggestedChanges", table =>
        {
            table.HasCheckConstraint(
                "CK_SuggestedChanges_Target",
                "(\"EntityId\" IS NOT NULL) + (\"StoryId\" IS NOT NULL) + (\"SceneId\" IS NOT NULL) = 1");
            table.HasCheckConstraint("CK_SuggestedChanges_Status", "\"Status\" IN (0, 1, 2)");
        });

        // Each key's index also serves "the suggestions on this", the only way they are listed - a handful per target.
        builder.HasOne(change => change.Entity).WithMany().HasForeignKey(change => change.EntityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(change => change.Story).WithMany().HasForeignKey(change => change.StoryId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(change => change.Scene).WithMany().HasForeignKey(change => change.SceneId).OnDelete(DeleteBehavior.Cascade);
    }
}
