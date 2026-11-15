using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.RuleValidation.Conditions;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Turns one evaluation into the stable key that identifies its finding across runs.
///
/// It is <see cref="CanonFingerprint"/>, deliberately: ADR 0072 says a World Logic finding is fingerprinted the way
/// ADR 0010 fingerprints a Canon conflict, and a second hasher would be a second chance to disagree about what
/// "the same problem" means. A cryptographic hash rather than <c>GetHashCode</c>, which is randomized per process
/// and would give the same problem a different key after every restart.
///
/// <b>What goes in is what makes two findings different problems.</b> The rule, the scope the evaluation ran in,
/// the outcome, the error code and the evidence in the evaluator's own order. Nothing else:
/// <list type="bullet">
/// <item>The rule version is out, so editing a rule's wording refreshes the finding it already produced rather than
/// opening a second one beside it. The version is stored on the row and kept current.</item>
/// <item>The rationale is out, for the same reason: it is the trace, not the problem.</item>
/// <item>The outcome is in, so a violation that becomes an unknown closes and a new finding opens. They are
/// different answers about the same rule, and reporting the second as a refreshed first would hide that the
/// evaluator stopped being able to prove anything.</item>
/// </list>
/// </summary>
public static class WorldLogicFingerprint
{
    /// <summary>
    /// The fingerprint of one evaluation. <paramref name="projectId"/> is the project the evaluation named, or null
    /// for the whole universe, and is part of the key because a project-scoped exception can change the outcome.
    /// </summary>
    public static string Of(
        Guid ruleId,
        Guid? projectId,
        WorldLogicFindingOutcome outcome,
        string? errorCode,
        IEnumerable<ConditionEvidence> evidence) =>
        CanonFingerprint.From(
            CanonFingerprint.Id(ruleId),
            [
                projectId is { } project ? CanonFingerprint.Id(project) : string.Empty,
                Name(outcome),
                errorCode ?? string.Empty,
                .. evidence.Select(item => $"{item.Source}:{item.Id}:{item.Role}"),
            ]);

    /// <summary>
    /// The outcome as the specification writes it. Text rather than the enum's number, so adding an outcome later
    /// never shifts an existing finding's fingerprint.
    /// </summary>
    private static string Name(WorldLogicFindingOutcome outcome) => outcome switch
    {
        WorldLogicFindingOutcome.Violation => "false",
        WorldLogicFindingOutcome.Unknown => "unknown",
        _ => "error",
    };
}
