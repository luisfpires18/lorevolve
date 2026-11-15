namespace LorEvolve.Api.Features.RuleValidation.Conditions;

/// <summary>One clause of a query: a field, an operator and the value it is compared against (ADR 0072, section 3.3).</summary>
public sealed record FactClause(string Field, string Operator, ConditionValue Value);

/// <summary>
/// One row a query returned, flattened to what a condition may read.
///
/// <paramref name="Id"/> is the row's own id for a subject or an event, and null for a relation, which has none.
/// <paramref name="Fields"/> holds every field of section 2's table for that source. A set-valued field, which is
/// only <c>subjectIds</c>, is in <paramref name="Members"/> instead.
/// </summary>
public sealed record FactRow(
    string? Id,
    IReadOnlyDictionary<string, ConditionValue> Fields,
    IReadOnlyList<string> Members);

/// <summary>
/// Where the facts a condition reads come from.
///
/// Two implementations exist and have to behave identically: one over a universe's own rows, and one over a
/// specification fixture. That is the point of the interface. The fixtures are the contract the evaluator is held
/// to, and they would prove nothing if the evaluator could only be run against them through a different path than
/// production uses.
///
/// <b>An implementation never decides semantics.</b> It returns rows and values; three-valued logic, budgets,
/// precedence and every error code belong to the evaluator. An implementation that filtered on its own, coerced a
/// missing value or ordered rows differently would move part of the specification out of the one place it is
/// tested.
///
/// <b>An implementation sees one universe.</b> The caller scopes it before the evaluator runs, so a condition
/// cannot read another universe's rows however its ids are written. That is the same boundary
/// <c>CanonRuleContext</c> enforces for a Canon rule.
/// </summary>
public interface IConditionFacts
{
    /// <summary>
    /// The rows of <paramref name="source"/> that match every clause, or null when the source is not one the
    /// specification names. An empty list is an answer; null is <c>unknown_source</c>.
    ///
    /// <paramref name="limit"/> is the evaluator's remaining query budget. An implementation reads at most that many
    /// rows plus one, so the evaluator can tell a full answer from a truncated one and report <c>query_limit</c>
    /// rather than a wrong count.
    /// </summary>
    IReadOnlyList<FactRow>? Query(string source, IReadOnlyList<FactClause> clauses, int limit);

    /// <summary>
    /// One attribute of one subject. Missing when the subject is not there or the attribute is not set on it, which
    /// the evaluator reports as <c>unknown</c> either way: an author cannot act differently on the two.
    /// </summary>
    ConditionValue Attribute(string subjectId, string attribute);

    /// <summary>
    /// One non-attribute field of one row of <paramref name="source"/>, by id. Missing when the row is not there.
    /// Null when the source or the field is not one the specification names.
    /// </summary>
    ConditionValue? Field(string source, string rowId, string field);

    /// <summary>Whether a relation row of <paramref name="type"/> joins the two references, in that direction.</summary>
    bool Related(string type, string fromId, string toId);
}
