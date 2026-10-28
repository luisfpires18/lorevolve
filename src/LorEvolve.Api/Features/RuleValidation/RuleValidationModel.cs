using System.Text;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Features.WorldRules;

namespace LorEvolve.Api.Features.RuleValidation;

/// <summary>What a validation term names. Stored with the term and never read from its name.</summary>
public enum ValidationTermKind
{
    /// <summary>What sort of moment something was: "Resurrection", "Coronation".</summary>
    EventKind = 0,

    /// <summary>How it happened: "Rite of Ash", "The Seven Stones".</summary>
    Method = 1,
}

/// <summary>
/// One label in a universe's small vocabulary for checking moments against world rules (ADR 0034).
///
/// <b>Identity is the id, never the name.</b> Two moments use "the same method" only because they point at the same term.
/// The name is how an author finds a term in a list: renaming one changes no match, and two terms whose names merely look
/// alike are two terms. The name is unique per kind inside the universe, compared case-insensitively, only so a list never
/// offers two entries an author cannot tell apart - never so a name can be matched against anything.
///
/// Deliberately flat: no hierarchy, no description, no method that belongs to an event kind, no custom field.
/// </summary>
public sealed class ValidationTerm
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>Fixed when the term is created. A method that became an event kind would re-mean every rule and moment naming it.</summary>
    public ValidationTermKind Kind { get; set; }

    /// <summary>Required and trimmed.</summary>
    public required string Name { get; set; }

    /// <summary>The name trimmed, composed and upper-cased: what uniqueness is enforced on. Never shown and never compared with a moment.</summary>
    public required string NormalizedName { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public static string Normalize(string name) => name.Trim().Normalize(NormalizationForm.FormC).ToUpperInvariant();
}

/// <summary>
/// The structured checks a world rule may carry. One pattern exists; anything else is not a check LorEvolve knows, and a rule
/// whose stored kind is not one of these is reported as impossible to check, never as passing.
/// </summary>
public enum WorldRuleValidationKind
{
    /// <summary>No check: the rule is words only. Never stored - a rule without a check has no row.</summary>
    None = 0,

    /// <summary>
    /// "At most <see cref="WorldRuleValidation.MaxOccurrences"/> Canon moments of one event kind by one method for each
    /// participant."
    /// </summary>
    MaxOccurrencesPerParticipantAndMethod = 1,
}

/// <summary>
/// The one structured check attached to a world rule (ADR 0034), keyed by the rule and gone with it. A rule without one is words
/// only and is never evaluated. Every part is an explicit id or number: nothing is read from the rule's title or description.
/// </summary>
public sealed class WorldRuleValidation
{
    public Guid WorldRuleId { get; set; }

    public WorldRule? WorldRule { get; set; }

    public WorldRuleValidationKind Kind { get; set; }

    /// <summary>A term of kind <see cref="ValidationTermKind.EventKind"/> in the rule's universe.</summary>
    public Guid EventKindTermId { get; set; }

    public ValidationTerm? EventKindTerm { get; set; }

    /// <summary>A term of kind <see cref="ValidationTermKind.Method"/> in the rule's universe.</summary>
    public Guid MethodTermId { get; set; }

    public ValidationTerm? MethodTerm { get; set; }

    /// <summary>How many matching Canon moments one participant may have. From 1.</summary>
    public int MaxOccurrences { get; set; }
}

/// <summary>
/// The optional structured details of one moment that world rule checks read (ADR 0034): what kind of event it was, by what
/// method, and whose. Keyed by the moment and gone with it; a moment with none has no row, and an ordinary moment never needs
/// one.
///
/// Each part is independent and may be absent. None is ever filled in from the moment's title, description or the entries
/// linked to it: <see cref="ParticipantEntityId"/> is chosen on its own, and an entry linked to the moment is not its participant
/// unless the author says so here.
/// </summary>
public sealed class TimelineEntryValidation
{
    public Guid TimelineEntryId { get; set; }

    public TimelineEntry? TimelineEntry { get; set; }

    public Guid? EventKindTermId { get; set; }

    public ValidationTerm? EventKindTerm { get; set; }

    public Guid? MethodTermId { get; set; }

    public ValidationTerm? MethodTerm { get; set; }

    /// <summary>The entry this moment happened to, by id. Its name is never copied here.</summary>
    public Guid? ParticipantEntityId { get; set; }

    public LoreEntity? ParticipantEntity { get; set; }
}
