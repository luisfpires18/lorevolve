using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;

namespace LorEvolve.Api.Features.Systems;

/// <summary>
/// Where a System or a rule definition lives: across the whole universe, or inside one project of it.
///
/// Stored as an int, so the names may be reordered only by never reusing a number. The scope is not a
/// permission: access always comes from the universe (ADR 0041), and a project-scoped row is reachable by
/// exactly the accounts that reach its universe. It is what an author organised by, and what decides whether a
/// project-scoped exception applies (ADR 0072).
/// </summary>
public enum WorldLogicScope
{
    /// <summary>The whole universe. <see cref="LoreSystem.ProjectId"/> and <see cref="SystemRule.ProjectId"/> are null.</summary>
    Universe = 0,

    /// <summary>One project inside the universe, named by the row's project id.</summary>
    Project = 1,
}

/// <summary>
/// A named set of rule definitions: "Runeforging", "Succession", "Trial protocol" (ADR 0072).
///
/// <b>A set, not a container.</b> A System references rule definitions through <see cref="LoreSystemRule"/>; it
/// does not own them. Two Systems that use the same rule reference one definition rather than copies, and
/// deleting a System deletes no rule. That is the reuse an author actually wants, and it is why rules are not
/// children of Systems.
///
/// <b>The words mean nothing.</b> As for a world rule (ADR 0033), neither <see cref="Name"/> nor
/// <see cref="Summary"/> is ever read for meaning. A System's machine-checkable content is entirely in the
/// conditions of the rules it references.
///
/// <b>Scoped to its universe, or to one project in it.</b> It is owned by the universe and gone with it.
/// </summary>
public sealed class LoreSystem
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public WorldLogicScope Scope { get; set; }

    /// <summary>The project this System belongs to, or null when it is the universe's. Required by <see cref="Scope"/>.</summary>
    public Guid? ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    /// <summary>Required, and trimmed when saved.</summary>
    public required string Name { get; set; }

    /// <summary>
    /// <see cref="Name"/> trimmed, composed and upper-cased: what uniqueness is enforced on, within one universe and
    /// one scope. Never shown and never compared with anything else.
    /// </summary>
    public required string NormalizedName { get; set; }

    /// <summary>Plain text exactly as written; <c>""</c> when there is none. Never rendered and never read for meaning.</summary>
    public required string Summary { get; set; }

    /// <summary>
    /// Counts up by one on every save that changes something, starting at 1. It is the token a save names, so two
    /// windows cannot quietly overwrite each other, and the version a revision row records.
    /// </summary>
    public int Version { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<LoreSystemRule> Rules { get; } = [];
}

/// <summary>
/// One saved state of a System's own metadata, written on every save that changed something (ADR 0072).
///
/// It is history, not a draft: nothing reads it to evaluate anything, and restoring one is not implemented. It
/// exists so an author can see what a System said before, the way <see cref="Lore.EntityRevision"/> does for an
/// entry. Which rules a System referenced at a given version is deliberately not recorded here: the links are a
/// set an author changes constantly, and a snapshot of them would be noise.
/// </summary>
public sealed class LoreSystemRevision
{
    public Guid SystemId { get; set; }

    /// <summary>Named for its type rather than "System", so the namespace stays reachable inside this class.</summary>
    public LoreSystem? LoreSystem { get; set; }

    /// <summary>The <see cref="LoreSystem.Version"/> this row is the state of. Unique with the System.</summary>
    public int Version { get; set; }

    public required string Name { get; set; }

    public required string Summary { get; set; }

    public DateTime SavedAt { get; set; }
}

/// <summary>
/// One reusable rule definition: words, and optionally one typed condition tree (ADR 0072).
///
/// <b>A definition in its own right.</b> A rule may belong to no System at all, to one, or to several. It is
/// never a child of a System.
///
/// <b>Not a world rule.</b> <see cref="WorldRules.WorldRule"/> stays exactly as it is, with its own table, ids,
/// endpoints and its one counting check (ADR 0034). This is the second, general kind of rule, and nothing
/// migrates between them. <see cref="Systems.WorldLogicRules"/> is what reads both into one list.
///
/// <b>The words mean nothing, and the condition is data.</b> <see cref="Title"/> and <see cref="Description"/>
/// are never read for meaning. <see cref="ConditionJson"/> is a bounded tree of closed node kinds, validated
/// against the specification when it is saved and never compiled, interpreted or reflected over. A rule with no
/// condition is words only, exactly as a world rule may be.
/// </summary>
public sealed class SystemRule
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public WorldLogicScope Scope { get; set; }

    /// <summary>The project this rule belongs to, or null when it is the universe's. Required by <see cref="Scope"/>.</summary>
    public Guid? ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    /// <summary>Required, and trimmed when saved.</summary>
    public required string Title { get; set; }

    /// <summary>Plain text exactly as written; <c>""</c> when there is none.</summary>
    public required string Description { get; set; }

    /// <summary>
    /// The condition schema version this rule's tree is written against, or null for a rule that is words only.
    /// A build that does not implement the stored version refuses to evaluate the rule with
    /// <c>schema_version_unsupported</c>, and never treats it as passing (ADR 0072).
    /// </summary>
    public int? SchemaVersion { get; set; }

    /// <summary>
    /// The condition tree as stored JSON, or null for a rule that is words only. Validated structurally on save by
    /// <see cref="ConditionSchema"/>: every node kind, operator, source, field and type is matched against a closed
    /// set, and the static budgets are enforced, so a stored condition can always be read.
    /// </summary>
    public string? ConditionJson { get; set; }

    /// <summary>
    /// The rule's explicit exceptions as stored JSON, or null for a rule that has none (ADR 0072, section 5.1).
    ///
    /// A JSON column rather than a table of its own, for the reason <see cref="ConditionJson"/> is one: an exception
    /// is a condition tree with a scope, it is only ever read with the rule it belongs to, and nothing queries one
    /// on its own. It is validated part by part on save, exactly as the condition is.
    ///
    /// Order is the author's and is part of the meaning: inside one scope, the first exception that holds wins.
    /// </summary>
    public string? ExceptionsJson { get; set; }

    /// <summary>Counts up by one on every save that changes something, starting at 1. As <see cref="LoreSystem.Version"/>.</summary>
    public int Version { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<SystemRuleDependency> Dependencies { get; } = [];
}

/// <summary>
/// One saved state of a rule definition, written on every save that changed something.
///
/// The condition is part of the snapshot, because an evaluation records the rule version it ran, and a finding
/// recorded under version 3 is only reproducible while version 3's condition can still be read (ADR 0072).
/// </summary>
public sealed class SystemRuleRevision
{
    public Guid RuleId { get; set; }

    public SystemRule? Rule { get; set; }

    /// <summary>The <see cref="SystemRule.Version"/> this row is the state of. Unique with the rule.</summary>
    public int Version { get; set; }

    public required string Title { get; set; }

    public required string Description { get; set; }

    public int? SchemaVersion { get; set; }

    public string? ConditionJson { get; set; }

    /// <summary>The exceptions the rule carried at this version, as stored. Null when it had none.</summary>
    public string? ExceptionsJson { get; set; }

    public DateTime SavedAt { get; set; }
}

/// <summary>
/// That one System references one rule definition, and where the rule sits in that System's list.
///
/// A link, not ownership: deleting the System deletes the link and leaves the rule, and a rule that is still
/// linked cannot be deleted at all. <see cref="SortOrder"/> is the author's order inside this System only, so the
/// same rule may sit in different places in two Systems. It never means priority: ADR 0072 gives rules no
/// ordering, and nothing in evaluation reads this number.
/// </summary>
public sealed class LoreSystemRule
{
    public Guid SystemId { get; set; }

    /// <summary>Named for its type rather than "System", so the namespace stays reachable inside this class.</summary>
    public LoreSystem? LoreSystem { get; set; }

    public Guid RuleId { get; set; }

    public SystemRule? Rule { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// A System's state machine: which attribute of which subject type its states are values of (ADR 0073).
///
/// <b>Data, never code.</b> A machine is a binding, states and transitions, and a transition's guard is an existing
/// <see cref="SystemRule"/>; there is no second condition format. At most one per System, keyed by the System, and
/// saved whole. A System with no row has no machine, which is also how a machine is removed.
/// </summary>
public sealed class SystemMachine
{
    public Guid SystemId { get; set; }

    /// <summary>Named for its type rather than "System", so the namespace stays reachable inside this class.</summary>
    public LoreSystem? LoreSystem { get; set; }

    /// <summary>The <c>type</c> of the subjects the machine covers, exactly as sent.</summary>
    public required string SubjectType { get; set; }

    /// <summary>The attribute whose value is a subject's state, exactly as sent.</summary>
    public required string Attribute { get; set; }

    /// <summary>The machine document version this row was saved under. Only 1 exists.</summary>
    public int SchemaVersion { get; set; }

    public ICollection<SystemState> States { get; } = [];
}

/// <summary>
/// One state of a machine. The id is the client's, unique within the document, so a canvas can name a state before
/// it is saved and a save is idempotent. <see cref="X"/> and <see cref="Y"/> are where the author put it and are never
/// read by a check; <see cref="SortOrder"/> is the order the document listed it in.
/// </summary>
public sealed class SystemState
{
    public Guid SystemId { get; set; }

    public SystemMachine? Machine { get; set; }

    public Guid Id { get; set; }

    /// <summary>What the author calls the state, trimmed. Carries no meaning, like every title.</summary>
    public required string Name { get; set; }

    /// <summary>The attribute value that means "in this state", exactly as sent, unique within the machine.</summary>
    public required string Value { get; set; }

    public bool IsInitial { get; set; }

    public double X { get; set; }

    public double Y { get; set; }

    public int SortOrder { get; set; }
}

/// <summary>
/// One transition of a machine. <see cref="SortOrder"/> is the declared order, and it is part of the record: it is
/// the evaluation order. <see cref="GuardRuleId"/> names a rule definition of the same universe that must hold, or
/// null for no requirement; a rule named here is in use and cannot be deleted.
/// </summary>
public sealed class SystemTransition
{
    public Guid SystemId { get; set; }

    public Guid Id { get; set; }

    public Guid FromStateId { get; set; }

    public SystemState? FromState { get; set; }

    public Guid ToStateId { get; set; }

    public SystemState? ToState { get; set; }

    /// <summary>Display only.</summary>
    public string? Label { get; set; }

    public Guid? GuardRuleId { get; set; }

    public SystemRule? GuardRule { get; set; }

    public int SortOrder { get; set; }
}

/// <summary>
/// That one rule definition declares it may reference another (ADR 0072).
///
/// The declared set is what a <c>ruleHolds</c> node may name; a reference to anything else is refused on save, so
/// the dependency graph is readable without walking every condition. A cycle is refused on save as well, because a
/// stored cycle would fail every rule on it at evaluation time with nothing an author could do from the finding.
/// </summary>
public sealed class SystemRuleDependency
{
    public Guid RuleId { get; set; }

    public SystemRule? Rule { get; set; }

    public Guid DependsOnRuleId { get; set; }

    public SystemRule? DependsOnRule { get; set; }
}
