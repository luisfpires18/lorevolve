using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.WorldRules;

/// <summary>
/// An explicit statement, written by the author, about how one fictional world works: "Teleportation cannot cross the Veil",
/// "A bonded dragon dies if its rider dies" (ADR 0033).
///
/// <b>A rule is not lore, a story, a moment, an idea or a Canon finding.</b> It is its own kind of authored content, owned by
/// its universe and gone with it. Saving, deleting or restoring one never creates or changes an entry, a relationship, a
/// timeline moment, a story, Canon or a Canon finding.
///
/// <b>The words mean nothing to LorEvolve.</b> Neither <see cref="Title"/> nor <see cref="Description"/> is ever read for meaning:
/// a rule titled "One resurrection per person" is text, not a constraint anything checks. Machine-checkable meaning, when it
/// comes, is configured explicitly and attached to a rule by its <see cref="Id"/> - never inferred from what it says.
///
/// Deliberately small: a title and an optional plain-text description. No priority, order, category, tag, severity, status,
/// enabled flag, condition or action; the list is by title, so a rule's position means nothing either.
/// </summary>
public sealed class WorldRule
{
    /// <summary>The rule's stable identity - what anything that ever refers to this rule names.</summary>
    public Guid Id { get; set; }

    /// <summary>The universe the rule belongs to. Ownership is the universe's owner's, and nothing else's.</summary>
    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>Required, and trimmed when saved.</summary>
    public required string Title { get; set; }

    /// <summary>Plain text exactly as written: never trimmed, rendered or read for meaning. <c>""</c> when there is none.</summary>
    public required string Description { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>When the rule last changed. Also the token a save names, so two windows cannot quietly overwrite each other.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>When the rule was moved to the Trash, or null while it is live. A rule in the Trash is kept whole.</summary>
    public DateTime? DeletedAt { get; set; }

    /// <summary>
    /// The one structured check the author attached, or null for a rule that is words only (ADR 0034). Configured explicitly,
    /// part by part; never derived from <see cref="Title"/> or <see cref="Description"/>.
    /// </summary>
    public WorldRuleValidation? Validation { get; set; }
}
