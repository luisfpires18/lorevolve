using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Progression;

namespace LorEvolve.Api.Features.Relationships;

/// <summary>
/// One stretch of time a relationship holds (Issue #18): a dated span on the universe's own chronology, each bound optional and
/// as precise as written - or the whole of one era of either end (<see cref="EntityEraId"/>, Issue #41). Never both.
///
/// A relationship with no period is timeless, exactly as every link was before. One with periods holds during any of them:
/// leaving a faction and returning is a second period on the same link, never a second link (owner decision, 2026-10-24),
/// so the one-row-per-link rule (ADR 0008) and the exact-duplicate refusal stand unchanged. Periods are part of the link: they
/// are replaced whole with its save, go to the Trash with it and come back with it, and say nothing to the Family Tree or a
/// Canon rule.
/// </summary>
public sealed class RelationshipPeriod
{
    public Guid Id { get; set; }

    public Guid RelationshipId { get; set; }

    public LoreRelationship? Relationship { get; set; }

    /// <summary>The period's place among its relationship's periods, from 0, as the author listed them.</summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// The era of one of the link's two ends this period is, or null for a dated period. An era's own span, if it has one, is
    /// the era's: nothing is copied here.
    /// </summary>
    public Guid? EntityEraId { get; set; }

    public EntityEra? EntityEra { get; set; }

    public Guid? StartEraId { get; set; }

    public ChronologyEra? StartEra { get; set; }

    public int? StartYear { get; set; }

    public int? StartMonth { get; set; }

    public Guid? StartMonthId { get; set; }

    public ChronologyCalendarMonth? StartCalendarMonth { get; set; }

    public int? StartDay { get; set; }

    public Guid? EndEraId { get; set; }

    public ChronologyEra? EndEra { get; set; }

    public int? EndYear { get; set; }

    public int? EndMonth { get; set; }

    public Guid? EndMonthId { get; set; }

    public ChronologyCalendarMonth? EndCalendarMonth { get; set; }

    public int? EndDay { get; set; }
}
