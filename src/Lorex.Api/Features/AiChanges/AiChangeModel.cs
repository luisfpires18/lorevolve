using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.AiChanges;

/// <summary>Which AI entry point staged a proposal (ADR 0047). Both reach the same staging, review and commit.</summary>
public enum AiChangeSource
{
    /// <summary>An outside AI app over MCP, through a connection the person approved for proposals.</summary>
    Mcp = 0,

    /// <summary>LoreX's own assistant, asked in its propose mode.</summary>
    Assistant = 1,
}

/// <summary>
/// Where a proposal stands. <see cref="Open"/> while any of its changes waits for a decision; the others once none does.
/// Whether an open change can still be applied is never stored: it is checked again whenever the proposal is read and
/// before anything is approved.
/// </summary>
public enum AiChangeProposalStatus
{
    Open = 0,

    /// <summary>Every change was approved and applied.</summary>
    Approved = 1,

    /// <summary>Some changes were applied and the rest rejected.</summary>
    PartiallyApproved = 2,

    /// <summary>Nothing was applied.</summary>
    Rejected = 3,

    /// <summary>Left undecided past <see cref="AiChangeLimits.OpenLifetime"/>: what was still waiting was closed unapplied.</summary>
    Expired = 4,
}

public enum AiChangeOperationStatus
{
    Pending = 0,

    /// <summary>Applied through the resource's own write path, by <see cref="AiChangeOperation.ResolvedByUserId"/>.</summary>
    Committed = 1,

    /// <summary>Closed without touching anything: rejected, needed by a rejected change, or expired.</summary>
    Rejected = 2,
}

/// <summary>
/// What an operation changes: the resources issue 32 approved, the rest of a universe's authored content issue 45 added
/// (ADR 0048), and the schema definitions issue 59 added (ADR 0062) - staged only by a person and a connection allowed to
/// propose schema, and never in the same proposal as content.
/// </summary>
public enum AiChangeResource
{
    LoreEntry = 0,
    Relationship = 1,
    Story = 2,
    Chapter = 3,
    Scene = 4,
    Manuscript = 5,
    TimelineEvent = 6,

    /// <summary>An entry's rich-text article, kept apart from its structured lore (ADR 0028).</summary>
    Article = 7,

    PlotArc = 8,
    PlotBeat = 9,
    WorldRule = 10,

    /// <summary>One of the universe owner's own ideas linked to this universe - never another account's (ADR 0030).</summary>
    Idea = 11,

    /// <summary>A lore type's definition (ADR 0062). Schema.</summary>
    LoreType = 12,

    /// <summary>A field definition of a lore type, with its choices; removal archives it (ADR 0062). Schema.</summary>
    LoreField = 13,

    /// <summary>A semantic group of lore types (ADR 0062). Schema.</summary>
    LoreGroup = 14,
}

public enum AiChangeAction
{
    Create = 0,
    Update = 1,

    /// <summary>To the Trash, through the resource's own lifecycle. Never a permanent delete.</summary>
    Remove = 2,

    /// <summary>A container's whole order - a story's chapters or arcs, a chapter's scenes, an arc's beats - through its own order route.</summary>
    Reorder = 3,
}

/// <summary>
/// One AI proposal: a bounded, ordered set of changes to one universe, staged and reviewed in LoreX (ADR 0047). Nothing in
/// it is content: the universe changes only when an authorised person approves operations, and then only through each
/// resource's ordinary write path.
///
/// The universe, the proposer and the source are the server's: the session or the MCP connection that staged it, never
/// anything the AI sent. The proposer's account id is raw, like a suggestion's (ADR 0044), so the record outlives a
/// membership; the universe cascades, so deleting the universe deletes its proposals.
/// </summary>
public sealed class AiChangeProposal
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string ProposedByUserId { get; set; }

    public AiChangeSource Source { get; set; }

    /// <summary>The MCP connection it came through, or null for the assistant. No foreign key: a revoke must not erase the record.</summary>
    public Guid? McpConnectionId { get; set; }

    /// <summary>The app's own name when it was staged, as the consent screen showed it. Self-declared unless verified.</summary>
    public string? ClientName { get; set; }

    /// <summary>The AI's own one-line description of the proposal: untrusted text, shown as text.</summary>
    public string? Summary { get; set; }

    public AiChangeProposalStatus Status { get; set; }

    /// <summary>
    /// Moved on by every edit a reviewer makes to a pending operation. An approval names the revision it was shown, so what
    /// is applied is exactly what was reviewed.
    /// </summary>
    public int Revision { get; set; } = 1;

    /// <summary>UTC.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>UTC. An open proposal still undecided then is closed, applying nothing.</summary>
    public DateTime ExpiresAt { get; set; }

    /// <summary>UTC. When the last pending operation was decided; null while open.</summary>
    public DateTime? ClosedAt { get; set; }

    public List<AiChangeOperation> Operations { get; set; } = [];
}

/// <summary>
/// One change inside a proposal: create, update or move to the Trash one resource. <see cref="Key"/> is the proposal-local
/// name the AI gave it, which other operations use to refer to what this one creates; <see cref="DependsOn"/> lists the
/// keys it needs, so a selection that leaves one out is refused rather than committed half-connected.
///
/// <see cref="Proposed"/> holds the normalised values as this feature's own JSON records (<c>AiChangeValues</c>), never the
/// AI's text as it arrived and never an API response type. <see cref="Before"/> is the target as it was stored when the
/// change was staged, for the review's "before" and - for resources with no edit version - for the check that nothing
/// changed it since. <see cref="BaseVersion"/> is the target's edit version when it has one.
/// </summary>
public sealed class AiChangeOperation
{
    public Guid Id { get; set; }

    public Guid ProposalId { get; set; }

    public AiChangeProposal? Proposal { get; set; }

    /// <summary>Its place in the proposal, from 0: the order the AI gave and the review shows.</summary>
    public int Sequence { get; set; }

    public required string Key { get; set; }

    public AiChangeResource Resource { get; set; }

    public AiChangeAction Action { get; set; }

    /// <summary>The existing resource an update or a removal is about. Null for a create until it commits.</summary>
    public Guid? TargetId { get; set; }

    public int? BaseVersion { get; set; }

    public string? Before { get; set; }

    public required string Proposed { get; set; }

    /// <summary>The keys of the operations this one needs, as a JSON array of strings.</summary>
    public required string DependsOn { get; set; }

    public AiChangeOperationStatus Status { get; set; }

    /// <summary>For a committed create: the id of what it made. For any committed operation: the resource it changed.</summary>
    public Guid? ResultId { get; set; }

    /// <summary>The approval that committed it, as the approver's client named it: a repeated approval finds it here.</summary>
    public Guid? ApprovalId { get; set; }

    public string? ResolvedByUserId { get; set; }

    /// <summary>UTC.</summary>
    public DateTime? ResolvedAt { get; set; }

    /// <summary>Why a rejected operation was closed when it was not a person's own choice: a code, never free text.</summary>
    public string? ResolutionNote { get; set; }
}

/// <summary>The bounds every proposal is held to, whoever staged it (ADR 0047).</summary>
public static class AiChangeLimits
{
    /// <summary>
    /// The most operations one proposal holds. Room for the issue's own example - twenty characters, five kingdoms, their
    /// relationships and three events - and for 50 modest entries with links, under the single writer one approval holds.
    /// </summary>
    public const int MaxOperations = 100;

    /// <summary>The most characters a proposal's normalised values take in all, prose included.</summary>
    public const int MaxPayloadCharacters = 400_000;

    /// <summary>The most prose one manuscript change carries: a long chapter, well under a scene's own bound.</summary>
    public const int MaxManuscriptCharacters = 100_000;

    /// <summary>How many proposals one account may have open in one universe; decide or reject some to stage more.</summary>
    public const int MaxOpenPerAccount = 20;

    public const int KeyMaxLength = 40;

    public const int SummaryMaxLength = 500;

    public const int ClientNameMaxLength = 80;

    public const int ResolutionNoteMaxLength = 40;

    /// <summary>How long a proposal stays open undecided.</summary>
    public static readonly TimeSpan OpenLifetime = TimeSpan.FromDays(14);

    /// <summary>How long a decided proposal is kept as a receipt before it is removed.</summary>
    public static readonly TimeSpan DecidedRetention = TimeSpan.FromDays(90);

    public const int PageSize = 20;
}

public sealed class AiChangeProposalConfiguration : IEntityTypeConfiguration<AiChangeProposal>
{
    public void Configure(EntityTypeBuilder<AiChangeProposal> builder)
    {
        builder.ToTable("AiChangeProposals", table =>
        {
            table.HasCheckConstraint("CK_AiChangeProposals_Status", "\"Status\" IN (0, 1, 2, 3, 4)");
            table.HasCheckConstraint("CK_AiChangeProposals_Source", "\"Source\" IN (0, 1)");
        });
        builder.HasKey(proposal => proposal.Id);

        builder.Property(proposal => proposal.ProposedByUserId).HasMaxLength(450);
        builder.Property(proposal => proposal.ClientName).HasMaxLength(AiChangeLimits.ClientNameMaxLength);
        builder.Property(proposal => proposal.Summary).HasMaxLength(AiChangeLimits.SummaryMaxLength);

        // A universe's proposals go with it.
        builder.HasOne(proposal => proposal.Universe)
            .WithMany()
            .HasForeignKey(proposal => proposal.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // "This universe's proposals, open first", and "this account's open proposals here" for the cap.
        builder.HasIndex(proposal => new { proposal.UniverseId, proposal.Status, proposal.CreatedAt });
        builder.HasIndex(proposal => new { proposal.ProposedByUserId, proposal.Status });
    }
}

public sealed class AiChangeOperationConfiguration : IEntityTypeConfiguration<AiChangeOperation>
{
    public void Configure(EntityTypeBuilder<AiChangeOperation> builder)
    {
        builder.ToTable("AiChangeOperations", table =>
        {
            table.HasCheckConstraint("CK_AiChangeOperations_Status", "\"Status\" IN (0, 1, 2)");
            table.HasCheckConstraint("CK_AiChangeOperations_Resource", "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14)");
            table.HasCheckConstraint("CK_AiChangeOperations_Action", "\"Action\" IN (0, 1, 2, 3)");
        });
        builder.HasKey(operation => operation.Id);

        builder.Property(operation => operation.Key).HasMaxLength(AiChangeLimits.KeyMaxLength);
        builder.Property(operation => operation.ResolvedByUserId).HasMaxLength(450);
        builder.Property(operation => operation.ResolutionNote).HasMaxLength(AiChangeLimits.ResolutionNoteMaxLength);

        builder.HasOne(operation => operation.Proposal)
            .WithMany(proposal => proposal.Operations)
            .HasForeignKey(operation => operation.ProposalId)
            .OnDelete(DeleteBehavior.Cascade);

        // One key and one place per operation inside its proposal.
        builder.HasIndex(operation => new { operation.ProposalId, operation.Key }).IsUnique();
        builder.HasIndex(operation => new { operation.ProposalId, operation.Sequence }).IsUnique();
    }
}
