using System.Globalization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Lore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.RuleValidation.Conditions;

/// <summary>
/// One universe's own rows as a fact source (ADR 0072, specification section 2).
///
/// <b>A snapshot, read once.</b> <see cref="LoadAsync"/> reads the universe's entries, relationships and moments in
/// one go, and evaluation then runs entirely over what it read. That is deliberate on three counts: evaluation is a
/// pure function of a fixed set of facts, so two runs over unchanged lore answer identically; a rule set cannot
/// issue one query per node against a database; and the snapshot is the same shape a fixture is, so the fixtures
/// test the code production runs.
///
/// <b>One universe, and the lore of it.</b> Everything is read with the universe's id in the predicate, so a
/// condition cannot reach another universe however its ids are written. Project entries stay behind their global
/// query filter (#143): a project's units are not the world's lore, and a rule about the world must not count them.
/// A project-scoped rule is still evaluated against the lore, because that is what version 1 of the specification
/// describes; reading a project's own entries is a later extension with its own fact source.
///
/// <b>What each source maps to.</b> A subject is a lore entry, its <c>type</c> the entry type's name and its
/// attributes the entry's field values by field name. A relation is a relationship, its <c>type</c> the relation
/// kind's name, on the stored direction only (ADR 0008). An event is a timeline moment: its <c>kind</c> and
/// <c>method</c> are the explicit terms the author attached (ADR 0034), its <c>subjectIds</c> the one participant
/// that moment names, its <c>at</c> the moment's start as a time point, and its <c>canon</c> whether it is Canon.
/// Nothing is read for meaning, and nothing is inferred from a title: that is ADR 0033's line, and this is on the
/// right side of it because every value here is one the author entered as a value.
/// </summary>
public sealed class UniverseConditionFacts : IConditionFacts
{
    private readonly Dictionary<Guid, Subject> _subjects;
    private readonly List<Relation> _relations;
    private readonly Dictionary<Guid, Moment> _moments;

    private UniverseConditionFacts(
        Dictionary<Guid, Subject> subjects,
        List<Relation> relations,
        Dictionary<Guid, Moment> moments)
    {
        _subjects = subjects;
        _relations = relations;
        _moments = moments;
    }

    /// <summary>
    /// The universe's facts, read once. The caller has already decided the reader may see this universe; nothing
    /// here checks access, and nothing here writes.
    /// </summary>
    public static async Task<UniverseConditionFacts> LoadAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var entries = await db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null)
            .Select(entity => new { entity.Id, Type = entity.EntityType!.Name })
            .ToListAsync(cancellationToken);

        // The field values of those entries, with the field's name and kind, so a value can be typed the way the
        // author declared it rather than guessed from what it looks like.
        var values = await db.EntityFieldValues.AsNoTracking()
            .Where(value => value.Entity!.UniverseId == universeId && value.Entity.DeletedAt == null)
            .Select(value => new
            {
                value.EntityId,
                Name = value.FieldDefinition!.Name,
                value.FieldDefinition.Kind,
                value.TextValue,
                value.NumberValue,
                value.BooleanValue,
                value.DateValue,
                value.EraId,
                OptionValue = value.Option != null ? value.Option.Value : null,
            })
            .ToListAsync(cancellationToken);

        var subjects = entries.ToDictionary(
            entry => entry.Id,
            entry => new Subject(entry.Id, entry.Type, new Dictionary<string, ConditionValue>(StringComparer.Ordinal)));

        foreach (var value in values)
        {
            if (!subjects.TryGetValue(value.EntityId, out var subject))
            {
                continue;
            }

            var typed = value.Kind switch
            {
                EntityFieldKind.Number => value.NumberValue is { } number
                    ? value.EraId is { } era
                        // A year in a named era is a point in that era's scope, not a bare number: ADR 0022 orders
                        // years only inside one era, and so does the specification.
                        ? ConditionValue.OfTimePoint(Era(era, number))
                        : ConditionValue.Of((decimal)number)
                    : ConditionValue.Missing,

                EntityFieldKind.Boolean => value.BooleanValue is { } flag
                    ? ConditionValue.Of(flag)
                    : ConditionValue.Missing,

                EntityFieldKind.Date => value.DateValue is { } date
                    ? ConditionValue.OfTimePoint(Calendar(DateOnly.FromDateTime(date)))
                    : ConditionValue.Missing,

                EntityFieldKind.EntityReference => ConditionValue.OfReference(value.TextValue),
                EntityFieldKind.Select or EntityFieldKind.MultiSelect => ConditionValue.OfText(value.OptionValue),
                _ => ConditionValue.OfText(value.TextValue),
            };

            if (!typed.IsMissing)
            {
                // A repeated field name keeps the first value: a MultiSelect writes one row per choice, and version
                // 1 of the specification has no set-valued attribute to read them all into.
                subject.Attributes.TryAdd(value.Name, typed);
            }
        }

        var relations = await db.Relationships.AsNoTracking()
            .Where(relationship => relationship.UniverseId == universeId && relationship.DeletedAt == null)
            .Select(relationship => new Relation(
                relationship.RelationshipType!.Name,
                relationship.SourceEntityId,
                relationship.TargetEntityId))
            .ToListAsync(cancellationToken);

        var moments = await db.TimelineEntries.AsNoTracking()
            .Where(entry => entry.UniverseId == universeId && entry.DeletedAt == null)
            .Select(entry => new
            {
                entry.Id,
                entry.CanonStatus,
                entry.StartYear,
                entry.StartMonth,
                entry.StartDay,
                entry.StartEraId,
                Kind = entry.Validation != null && entry.Validation.EventKindTerm != null
                    ? entry.Validation.EventKindTerm.Name
                    : null,
                Method = entry.Validation != null && entry.Validation.MethodTerm != null
                    ? entry.Validation.MethodTerm.Name
                    : null,
                Participant = entry.Validation != null ? entry.Validation.ParticipantEntityId : null,
            })
            .ToListAsync(cancellationToken);

        return new UniverseConditionFacts(
            subjects,
            relations,
            moments.ToDictionary(
                moment => moment.Id,
                moment => new Moment(
                    moment.Id,
                    moment.Kind,
                    moment.Method,
                    moment.Participant is { } participant ? [participant.ToString()] : [],
                    At(moment.StartEraId, moment.StartYear, moment.StartMonth, moment.StartDay),
                    moment.CanonStatus == CanonStatus.Canon)));
    }

    public IReadOnlyList<FactRow>? Query(string source, IReadOnlyList<FactClause> clauses, int limit)
    {
        var rows = source switch
        {
            "subjects" => _subjects.Values.Select(Row),
            "relations" => _relations.Select(Row),
            "events" => _moments.Values.Select(Row),
            _ => null,
        };

        // limit + 1, so the evaluator can tell a full answer from one that hit the budget.
        return rows?.Where(row => clauses.All(clause => Matches(row, clause))).Take(limit + 1).ToList();
    }

    public ConditionValue Attribute(string subjectId, string attribute) =>
        Guid.TryParse(subjectId, out var id)
        && _subjects.TryGetValue(id, out var subject)
        && subject.Attributes.TryGetValue(attribute, out var value)
            ? value
            : ConditionValue.Missing;

    public ConditionValue? Field(string source, string rowId, string field)
    {
        if (!Systems.ConditionSchema.SourceFields.TryGetValue(source, out var fields))
        {
            return null;
        }

        if (!fields.Contains(field, StringComparer.Ordinal))
        {
            return null;
        }

        if (!Guid.TryParse(rowId, out var id))
        {
            return ConditionValue.Missing;
        }

        return source switch
        {
            "subjects" => _subjects.TryGetValue(id, out var subject)
                ? field == "id" ? ConditionValue.OfReference(subject.Id.ToString()) : ConditionValue.OfText(subject.Type)
                : ConditionValue.Missing,

            "events" => _moments.TryGetValue(id, out var moment)
                ? field switch
                {
                    "id" => ConditionValue.OfReference(moment.Id.ToString()),
                    "kind" => ConditionValue.OfText(moment.Kind),
                    "method" => ConditionValue.OfText(moment.Method),
                    "at" => ConditionValue.OfTimePoint(moment.At),
                    "canon" => ConditionValue.Of(moment.Canon),

                    // A set has no one value to read; membership is what a clause's contains is for.
                    _ => ConditionValue.Missing,
                }
                : ConditionValue.Missing,

            // A relationship row has no id of its own in this model, so there is nothing to read one of by id.
            _ => ConditionValue.Missing,
        };
    }

    public bool Related(string type, string fromId, string toId) =>
        Guid.TryParse(fromId, out var from)
        && Guid.TryParse(toId, out var to)
        && _relations.Any(relation =>
            string.Equals(relation.Type, type, StringComparison.Ordinal)
            && relation.FromId == from
            && relation.ToId == to);

    /// <summary>A moment's start as a time point: a year in an era, a date on a calendar, or a plain year.</summary>
    private static string? At(Guid? eraId, int? year, int? month, int? day)
    {
        if (year is not { } startYear)
        {
            return null;
        }

        if (eraId is { } era)
        {
            return Era(era, startYear);
        }

        // A full date is a calendar point; a year alone is a point on the plain reckoning, which is its own scope
        // because a signed year and a calendar date are not ordered against each other (ADR 0022).
        return month is { } startMonth && day is { } startDay
            ? Calendar(new DateOnly(Math.Max(startYear, 1), startMonth, startDay))
            : $"year:{startYear.ToString(CultureInfo.InvariantCulture)}";
    }

    private static string Era(Guid eraId, double year) =>
        $"era:{eraId}/{year.ToString(CultureInfo.InvariantCulture)}";

    private static string Era(Guid eraId, int year) =>
        $"era:{eraId}/{year.ToString(CultureInfo.InvariantCulture)}";

    private static string Calendar(DateOnly date) => $"calendar:{date:yyyy-MM-dd}";

    private static FactRow Row(Subject subject) => new(
        subject.Id.ToString(),
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["id"] = ConditionValue.OfReference(subject.Id.ToString()),
            ["type"] = ConditionValue.OfText(subject.Type),
        },
        []);

    private static FactRow Row(Relation relation) => new(
        null,
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["type"] = ConditionValue.OfText(relation.Type),
            ["fromId"] = ConditionValue.OfReference(relation.FromId.ToString()),
            ["toId"] = ConditionValue.OfReference(relation.ToId.ToString()),
        },
        []);

    private static FactRow Row(Moment moment) => new(
        moment.Id.ToString(),
        new Dictionary<string, ConditionValue>(StringComparer.Ordinal)
        {
            ["id"] = ConditionValue.OfReference(moment.Id.ToString()),
            ["kind"] = ConditionValue.OfText(moment.Kind),
            ["method"] = ConditionValue.OfText(moment.Method),
            ["at"] = ConditionValue.OfTimePoint(moment.At),
            ["canon"] = ConditionValue.Of(moment.Canon),
        },
        moment.SubjectIds);

    /// <summary>
    /// One clause against one row. The same comparison the evaluator makes, kept here because a query's clauses are
    /// the fact source's own filter; nothing in it decides an outcome, only whether a row is returned.
    /// </summary>
    private static bool Matches(FactRow row, FactClause clause)
    {
        if (clause.Operator == "contains")
        {
            return clause.Value.Kind == ConditionValueKind.Reference
                   && row.Members.Contains(clause.Value.Text!, StringComparer.Ordinal);
        }

        if (!row.Fields.TryGetValue(clause.Field, out var value)
            || value.IsMissing
            || clause.Value.IsMissing
            || value.Kind != clause.Value.Kind)
        {
            return false;
        }

        if (clause.Operator is "eq" or "ne")
        {
            var equal = value.Kind switch
            {
                ConditionValueKind.Boolean => value.Boolean == clause.Value.Boolean,
                ConditionValueKind.Number => value.Number == clause.Value.Number,
                _ => string.Equals(value.Text, clause.Value.Text, StringComparison.Ordinal),
            };

            return clause.Operator == "eq" ? equal : !equal;
        }

        if (value.Kind == ConditionValueKind.TimePoint && value.TimeScope() != clause.Value.TimeScope())
        {
            return false;
        }

        var left = value.Kind == ConditionValueKind.Number ? value.Number : value.TimeOrder();
        var right = clause.Value.Kind == ConditionValueKind.Number ? clause.Value.Number : clause.Value.TimeOrder();

        if (left is null || right is null)
        {
            return false;
        }

        return clause.Operator switch
        {
            "lt" => left < right,
            "lte" => left <= right,
            "gt" => left > right,
            "gte" => left >= right,
            _ => false,
        };
    }

    private sealed record Subject(Guid Id, string Type, Dictionary<string, ConditionValue> Attributes);

    private sealed record Relation(string Type, Guid FromId, Guid ToId);

    private sealed record Moment(
        Guid Id,
        string? Kind,
        string? Method,
        IReadOnlyList<string> SubjectIds,
        string? At,
        bool Canon);
}
