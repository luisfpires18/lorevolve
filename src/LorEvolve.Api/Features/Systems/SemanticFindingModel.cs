using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Where a semantic finding stands with the author. There is deliberately no value that means "violation": a
/// semantic finding is what a connected AI client claimed, and ADR 0072 is explicit that nothing a model asserts is
/// ever recorded as a proven violation. Accepting one records that the author agrees it is worth acting on, not that
/// the claim was verified by anything; the deterministic answer to "does this rule hold" only ever comes from
/// <see cref="RuleValidation.Conditions.WorldLogicEvaluator"/> and lands in <see cref="WorldLogicFinding"/>.
/// </summary>
public enum SemanticFindingStatus
{
    /// <summary>What every submission is, and the only status a connection can cause. Nothing has checked it.</summary>
    Unverified = 0,

    /// <summary>The author read it and wants to act on it. Still not a verified violation.</summary>
    Accepted = 1,

    /// <summary>The author read it and disagrees, or it does not matter.</summary>
    Dismissed = 2,
}

/// <summary>
/// What kind of record a citation points at, so a reader can follow it without guessing. Every one of these is
/// something a connected client can already read over MCP, which is the point: a claim may only cite what the client
/// was shown.
/// </summary>
public enum SemanticCitationKind
{
    LoreEntry = 0,
    Relationship = 1,
    TimelineMoment = 2,
    Scene = 3,

    /// <summary>A scene's prose, cited by that scene's id: a manuscript is keyed by its scene.</summary>
    Manuscript = 4,

    /// <summary>ADR 0034's world rule, the kind written in words.</summary>
    WorldRule = 5,

    /// <summary>A World Logic rule definition, which may carry a typed condition (ADR 0072).</summary>
    SystemRule = 6,
}

/// <summary>
/// One claim a connected AI client made about this universe's meaning, submitted over MCP for the author to review
/// (#154, ADR 0072, ADR 0046, ADR 0047).
///
/// <para><b>It is kept apart from a proven finding on purpose.</b> This is a different table from
/// <see cref="WorldLogicFinding"/>, reached by different routes, with a status set that cannot say "violation". A
/// filter cannot be forgotten, because there is nothing to filter: a reader of the deterministic findings never sees
/// one of these, and a reader of these is told in the shape of the data that nothing verified it.</para>
///
/// <para><b>It cites, so the author can check it.</b> At least one <see cref="SemanticFindingCitation"/> is required,
/// each naming the record, the version of that record the client read and, where the claim is about prose, the range
/// inside it. Those three are what make the claim checkable rather than an assertion.</para>
///
/// <para><b>It is review state, not the world.</b> Like an AI change proposal (ADR 0047), it carries the connection
/// and the account that submitted it, so it is left out of a universe backup for the same reason.</para>
/// </summary>
public sealed class SemanticFinding
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>The scope the claim is about, when the client named one of this universe's projects.</summary>
    public Guid? ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    /// <summary>
    /// The World Logic rule the claim is about, when the client named one. Optional: a client may observe that two
    /// entries contradict each other without any rule covering it, which is the whole point of a semantic finding.
    /// </summary>
    public Guid? RuleId { get; set; }

    public SystemRule? Rule { get; set; }

    /// <summary>One line naming the claim, as the client wrote it.</summary>
    public required string Title { get; set; }

    /// <summary>The claim itself, in the client's words. Never evaluated, never executed, never parsed.</summary>
    public required string Claim { get; set; }

    public SemanticFindingStatus Status { get; set; }

    /// <summary>The connection the claim came through (ADR 0046), so the author knows which app said it.</summary>
    public Guid ConnectionId { get; set; }

    /// <summary>The app's name as it registered it: self-declared unless its host was verified.</summary>
    public string? ClientName { get; set; }

    /// <summary>The account whose connection this was. The claim is the model's; the submission is theirs.</summary>
    public required string SubmittedByUserId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>When the author accepted or dismissed it; null while it is unverified.</summary>
    public DateTime? DecidedAt { get; set; }

    /// <summary>What the author wrote when deciding, if anything.</summary>
    public string? DecisionNote { get; set; }

    public ICollection<SemanticFindingCitation> Citations { get; } = [];
}

/// <summary>
/// One record a semantic finding cites, with the version the client read and the range inside it, in the order the
/// client sent them.
/// </summary>
public sealed class SemanticFindingCitation
{
    public Guid FindingId { get; set; }

    public SemanticFinding? Finding { get; set; }

    public int SortOrder { get; set; }

    public SemanticCitationKind Kind { get; set; }

    /// <summary>The record's id as a LorEvolve read tool gave it.</summary>
    public Guid SourceId { get; set; }

    /// <summary>
    /// The version of that record the client read, when the record has one. A claim about a scene's manuscript is
    /// only checkable against the manuscript the client saw, so a later edit makes the citation visibly stale.
    /// </summary>
    public int? SourceVersion { get; set; }

    /// <summary>Where in the cited text the claim is, as a character offset. Null when the claim is about the whole record.</summary>
    public int? RangeStart { get; set; }

    /// <summary>How many characters the range covers. Null with <see cref="RangeStart"/>, or on its own for "to the end".</summary>
    public int? RangeLength { get; set; }

    /// <summary>What this record contributes to the claim, in the client's words: "the earlier statement", say.</summary>
    public required string Note { get; set; }
}
