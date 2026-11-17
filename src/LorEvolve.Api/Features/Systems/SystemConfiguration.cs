using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Systems;

/// <summary>The bounds a System and a rule definition are held to. Mirrored by the web client, which says so before a save.</summary>
public static class WorldLogicLimits
{
    /// <summary>The same bound a story, project, arc or world rule title has.</summary>
    public const int NameMaxLength = 200;

    /// <summary>A paragraph or two, as a project's summary has. A System's substance is its rules, not this field.</summary>
    public const int SummaryMaxLength = 2_000;

    /// <summary>The same bound a world rule's description has: explanatory text in a form, not prose in an editor.</summary>
    public const int DescriptionMaxLength = 10_000;

    /// <summary>How much of a description or summary a list row carries, as a world rule's excerpt.</summary>
    public const int ExcerptLength = 240;

    /// <summary>How many rule definitions one System may reference. Past this a System is a list, not a set.</summary>
    public const int MaxRulesPerSystem = 500;

    /// <summary>How many dependencies one rule may declare.</summary>
    public const int MaxDependenciesPerRule = 16;

    /// <summary>
    /// How many rows of each kind the unified World Logic list reads before merging them. It is a safety bound on a
    /// list that is read whole rather than paged in SQL, not a product limit: a universe's rules are counted in
    /// tens, and the two kinds have their own paged routes for anything larger.
    /// </summary>
    public const int MaxMergedRules = 2_000;

    /// <summary>Default and largest page of a list route, as world rules have.</summary>
    public const int DefaultPageSize = 50;

    public const int MaxPageSize = 100;

    /// <summary>How many states one machine may hold (state machine specification, section 7).</summary>
    public const int MaxStates = 64;

    /// <summary>How many transitions one machine may hold (state machine specification, section 7).</summary>
    public const int MaxTransitions = 256;

    /// <summary>How far from the origin a state may sit on the canvas, as an idea board card.</summary>
    public const double MaxCoordinate = 1_000_000;
}

public sealed class LoreSystemConfiguration : IEntityTypeConfiguration<LoreSystem>
{
    public void Configure(EntityTypeBuilder<LoreSystem> builder)
    {
        builder.ToTable("LoreSystems");
        builder.HasKey(system => system.Id);

        builder.Property(system => system.Name).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(system => system.NormalizedName).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(system => system.Summary).IsRequired().HasMaxLength(WorldLogicLimits.SummaryMaxLength);

        // Every other enum in this schema is stored as an int, so a rename never rewrites rows.
        builder.Property(system => system.Scope).HasConversion<int>();

        // Owned by the universe and gone with it, as a world rule is: a System means nothing apart from its world.
        builder.HasOne(system => system.Universe)
            .WithMany()
            .HasForeignKey(system => system.UniverseId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // A project-scoped System goes with its project. The project is inside this universe, which the save checks:
        // a foreign key cannot say "the same universe as the row that points at it".
        builder.HasOne(system => system.Project)
            .WithMany()
            .HasForeignKey(system => system.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // One name per universe and scope, on the normalized form, so a list never offers two a reader cannot tell
        // apart. A project-scoped name is unique inside that project: two projects may each have a "Combat".
        builder.HasIndex(system => new { system.UniverseId, system.ProjectId, system.NormalizedName }).IsUnique();

        // Every read starts from the universe, newest first; the foreign key too.
        builder.HasIndex(system => new { system.UniverseId, system.UpdatedAt });
    }
}

public sealed class LoreSystemRevisionConfiguration : IEntityTypeConfiguration<LoreSystemRevision>
{
    public void Configure(EntityTypeBuilder<LoreSystemRevision> builder)
    {
        builder.ToTable("LoreSystemRevisions");
        builder.HasKey(revision => new { revision.SystemId, revision.Version });

        builder.Property(revision => revision.Name).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(revision => revision.Summary).IsRequired().HasMaxLength(WorldLogicLimits.SummaryMaxLength);

        builder.HasOne(revision => revision.LoreSystem)
            .WithMany()
            .HasForeignKey(revision => revision.SystemId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SystemRuleConfiguration : IEntityTypeConfiguration<SystemRule>
{
    public void Configure(EntityTypeBuilder<SystemRule> builder)
    {
        builder.ToTable("SystemRules");
        builder.HasKey(rule => rule.Id);

        builder.Property(rule => rule.Title).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(rule => rule.Description).IsRequired().HasMaxLength(WorldLogicLimits.DescriptionMaxLength);
        builder.Property(rule => rule.ConditionJson).HasMaxLength(ConditionSchema.MaxConditionBytes);

        // The exceptions are bounded by their count and each one's own condition, so the column's bound is the
        // condition's times the exception count, which is what a save enforces part by part.
        builder.Property(rule => rule.ExceptionsJson)
            .HasMaxLength(ConditionSchema.MaxConditionBytes * ConditionSchema.MaxExceptions);

        builder.Property(rule => rule.Scope).HasConversion<int>();

        builder.HasOne(rule => rule.Universe)
            .WithMany()
            .HasForeignKey(rule => rule.UniverseId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(rule => rule.Project)
            .WithMany()
            .HasForeignKey(rule => rule.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // A rule definition's title is not unique: two Systems may each want a rule called "Age of majority", and
        // the id is what anything refers to. Only a System's own name is unique.
        builder.HasIndex(rule => new { rule.UniverseId, rule.UpdatedAt });
    }
}

public sealed class SystemRuleRevisionConfiguration : IEntityTypeConfiguration<SystemRuleRevision>
{
    public void Configure(EntityTypeBuilder<SystemRuleRevision> builder)
    {
        builder.ToTable("SystemRuleRevisions");
        builder.HasKey(revision => new { revision.RuleId, revision.Version });

        builder.Property(revision => revision.Title).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(revision => revision.Description).IsRequired().HasMaxLength(WorldLogicLimits.DescriptionMaxLength);
        builder.Property(revision => revision.ConditionJson).HasMaxLength(ConditionSchema.MaxConditionBytes);
        builder.Property(revision => revision.ExceptionsJson)
            .HasMaxLength(ConditionSchema.MaxConditionBytes * ConditionSchema.MaxExceptions);

        builder.HasOne(revision => revision.Rule)
            .WithMany()
            .HasForeignKey(revision => revision.RuleId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class LoreSystemRuleConfiguration : IEntityTypeConfiguration<LoreSystemRule>
{
    public void Configure(EntityTypeBuilder<LoreSystemRule> builder)
    {
        builder.ToTable("LoreSystemRules");
        builder.HasKey(link => new { link.SystemId, link.RuleId });

        builder.HasOne(link => link.LoreSystem)
            .WithMany(system => system.Rules)
            .HasForeignKey(link => link.SystemId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Cascade, with the protection in the endpoint rather than the foreign key. Restrict here looks stricter and
        // is wrong: deleting a universe cascades its rule definitions, and a restricted link row would refuse that
        // whole delete over a row the universe owns on both sides. So the database keeps a universe deletable, and
        // SystemRuleEndpoints refuses deleting a referenced rule with 409 and names the Systems in the way, which is
        // the message an author can act on anyway.
        builder.HasOne(link => link.Rule)
            .WithMany()
            .HasForeignKey(link => link.RuleId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Which Systems reference one rule: what the delete check and the rule's detail both read.
        builder.HasIndex(link => link.RuleId);
    }
}

public sealed class SystemRuleDependencyConfiguration : IEntityTypeConfiguration<SystemRuleDependency>
{
    public void Configure(EntityTypeBuilder<SystemRuleDependency> builder)
    {
        builder.ToTable("SystemRuleDependencies");
        builder.HasKey(dependency => new { dependency.RuleId, dependency.DependsOnRuleId });

        builder.HasOne(dependency => dependency.Rule)
            .WithMany(rule => rule.Dependencies)
            .HasForeignKey(dependency => dependency.RuleId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Cascade for the same reason as the link above: a universe has to stay deletable, and the refusal to delete
        // a rule something still depends on is the endpoint's, with the dependent rules named.
        builder.HasOne(dependency => dependency.DependsOnRule)
            .WithMany()
            .HasForeignKey(dependency => dependency.DependsOnRuleId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(dependency => dependency.DependsOnRuleId);
    }
}

public sealed class SystemMachineConfiguration : IEntityTypeConfiguration<SystemMachine>
{
    public void Configure(EntityTypeBuilder<SystemMachine> builder)
    {
        builder.ToTable("SystemMachines");
        builder.HasKey(machine => machine.SystemId);

        builder.Property(machine => machine.SubjectType).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(machine => machine.Attribute).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);

        // One per System and gone with it, so deleting a System needs no code for its machine.
        builder.HasOne(machine => machine.LoreSystem)
            .WithOne()
            .HasForeignKey<SystemMachine>(machine => machine.SystemId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SystemStateConfiguration : IEntityTypeConfiguration<SystemState>
{
    public void Configure(EntityTypeBuilder<SystemState> builder)
    {
        builder.ToTable("SystemStates");
        builder.HasKey(state => new { state.SystemId, state.Id });

        builder.Property(state => state.Name).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);
        builder.Property(state => state.Value).IsRequired().HasMaxLength(WorldLogicLimits.NameMaxLength);

        builder.HasOne(state => state.Machine)
            .WithMany(machine => machine.States)
            .HasForeignKey(state => state.SystemId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SystemTransitionConfiguration : IEntityTypeConfiguration<SystemTransition>
{
    public void Configure(EntityTypeBuilder<SystemTransition> builder)
    {
        builder.ToTable("SystemTransitions");
        builder.HasKey(transition => new { transition.SystemId, transition.Id });

        builder.Property(transition => transition.Label).HasMaxLength(WorldLogicLimits.NameMaxLength);

        // Both ends keyed with the System, as an idea board's lines are with the board: no transition can join two
        // machines, and the machine's cascade reaches transitions through its states.
        builder.HasOne(transition => transition.FromState)
            .WithMany()
            .HasForeignKey(transition => new { transition.SystemId, transition.FromStateId })
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(transition => transition.ToState)
            .WithMany()
            .HasForeignKey(transition => new { transition.SystemId, transition.ToStateId })
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // Cascade, with the refusal in the endpoint, for the reason the System's rule link gives: a universe has to
        // stay deletable, and SystemRuleEndpoints refuses deleting a rule a transition still names as its guard.
        builder.HasOne(transition => transition.GuardRule)
            .WithMany()
            .HasForeignKey(transition => transition.GuardRuleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Which transitions name one rule: what the rule's delete check reads.
        builder.HasIndex(transition => transition.GuardRuleId);
    }
}
