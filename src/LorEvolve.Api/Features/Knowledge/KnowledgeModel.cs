using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Knowledge;

/// <summary>
/// One thing one actor knows, and from when (issue 15, ADR 0057): "Mira knows the heir survived - since The Causeway".
///
/// <b>An author's statement, never an inference.</b> LorEvolve writes no record on its own: nothing is derived from a scene's
/// lore links, a relationship, a field or the prose, and a record changes no lore, Canon status, relationship or scene. It
/// is what the author says the actor knows, in the author's words (<see cref="Statement"/>), optionally about one other
/// entry (<see cref="SubjectEntityId"/>), and it is not what the actor believes or how they see it - perspective and belief
/// are issue 16 and are not modelled here.
///
/// <b>Anchored to a scene, or known from the start.</b> Exactly one: <see cref="SceneId"/> names the scene in which the
/// actor comes to know it, read in the story's own order (ADR 0024), or <see cref="KnownFromStart"/> says they always knew.
/// The database refuses both and neither. No anchor to a timeline moment (owner decision): story order is what a
/// continuity check reads.
///
/// <b>Lives with what it names.</b> Erasing the knower, the scene or the universe takes the record; erasing the subject
/// leaves the record about nobody in particular. The Trash takes nothing: a record whose scene, knower or subject is binned
/// is kept and marked, and comes back whole with them.
///
/// Read by every member, changed by whoever edits content, never public and never read by the assistant, MCP or an AI
/// proposal - its own table, no projection of an entry or a scene carries it. In the owner's backup since format 33.
/// </summary>
public sealed class KnowledgeRecord
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>The actor who knows: any live entry of the universe, whatever its type.</summary>
    public Guid KnowerEntityId { get; set; }

    public LoreEntity? Knower { get; set; }

    /// <summary>What the knowledge is about, when it is about one entry; null for a statement about nothing in particular.</summary>
    public Guid? SubjectEntityId { get; set; }

    public LoreEntity? Subject { get; set; }

    /// <summary>What they know, in the author's words. Trimmed, never empty.</summary>
    public required string Statement { get; set; }

    /// <summary>The scene in which they come to know it; null exactly when <see cref="KnownFromStart"/>.</summary>
    public Guid? SceneId { get; set; }

    public Scene? Scene { get; set; }

    public bool KnownFromStart { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}

public static class KnowledgeLimits
{
    public const int StatementMaxLength = 1000;
}

public sealed class KnowledgeRecordConfiguration : IEntityTypeConfiguration<KnowledgeRecord>
{
    public void Configure(EntityTypeBuilder<KnowledgeRecord> builder)
    {
        builder.ToTable("KnowledgeRecords", table => table.HasCheckConstraint(
            "CK_KnowledgeRecords_Anchor",
            "(\"SceneId\" IS NOT NULL) + \"KnownFromStart\" = 1"));

        builder.HasKey(record => record.Id);
        builder.Property(record => record.Statement).IsRequired().HasMaxLength(KnowledgeLimits.StatementMaxLength);

        builder.HasOne(record => record.Universe).WithMany().HasForeignKey(record => record.UniverseId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(record => record.Knower).WithMany().HasForeignKey(record => record.KnowerEntityId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(record => record.Subject).WithMany().HasForeignKey(record => record.SubjectEntityId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(record => record.Scene).WithMany().HasForeignKey(record => record.SceneId).OnDelete(DeleteBehavior.Cascade);

        // The four keys' own indexes serve every listing: by universe, by knower, by subject, by scene.
    }
}
