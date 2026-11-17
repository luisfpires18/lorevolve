using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.CinemaSagas;

/// <summary>
/// A named run of Cinema releases in one universe (#289): its Phases group independent Film and Series projects in a
/// release order. A saga only records membership; no project is moved, copied or reparented by it.
/// </summary>
public sealed class CinemaSaga
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>The edit version (ADR 0043): 1 when created, advanced by every edit.</summary>
    public int Version { get; set; } = 1;

    public List<CinemaPhase> Phases { get; set; } = [];
}

public sealed class CinemaPhase
{
    public Guid Id { get; set; }

    public Guid SagaId { get; set; }

    public CinemaSaga? Saga { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public int Version { get; set; } = 1;

    public List<CinemaPhaseMembership> Members { get; set; } = [];
}

/// <summary>One project's place in a phase. A project is in at most one phase, and leaving it never touches the project.</summary>
public sealed class CinemaPhaseMembership
{
    public Guid Id { get; set; }

    public Guid PhaseId { get; set; }

    public CinemaPhase? Phase { get; set; }

    public Guid ProjectId { get; set; }

    public CreativeProject? Project { get; set; }

    public int SortOrder { get; set; }
}

public static class CinemaSagaLimits
{
    public const int NameMaxLength = 200;

    public const int SummaryMaxLength = 4_000;

    public const int MaxSagasPerUniverse = 100;

    public const int MaxPhasesPerSaga = 100;

    public const int MaxMembersPerPhase = 500;

    /// <summary>The kinds a phase may hold: Cinema is Film and Series.</summary>
    public static bool Holds(ProjectKind kind) => kind is ProjectKind.Film or ProjectKind.Series;
}

public sealed class CinemaSagaConfiguration : IEntityTypeConfiguration<CinemaSaga>
{
    public void Configure(EntityTypeBuilder<CinemaSaga> builder)
    {
        builder.ToTable("CinemaSagas");
        builder.HasKey(saga => saga.Id);
        builder.Property(saga => saga.Name).IsRequired().HasMaxLength(CinemaSagaLimits.NameMaxLength);
        builder.Property(saga => saga.Summary).HasMaxLength(CinemaSagaLimits.SummaryMaxLength);

        builder.HasOne(saga => saga.Universe)
            .WithMany()
            .HasForeignKey(saga => saga.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(saga => new { saga.UniverseId, saga.SortOrder });
    }
}

public sealed class CinemaPhaseConfiguration : IEntityTypeConfiguration<CinemaPhase>
{
    public void Configure(EntityTypeBuilder<CinemaPhase> builder)
    {
        builder.ToTable("CinemaPhases");
        builder.HasKey(phase => phase.Id);
        builder.Property(phase => phase.Name).IsRequired().HasMaxLength(CinemaSagaLimits.NameMaxLength);
        builder.Property(phase => phase.Summary).HasMaxLength(CinemaSagaLimits.SummaryMaxLength);

        builder.HasOne(phase => phase.Saga)
            .WithMany(saga => saga.Phases)
            .HasForeignKey(phase => phase.SagaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(phase => new { phase.SagaId, phase.SortOrder });
    }
}

public sealed class CinemaPhaseMembershipConfiguration : IEntityTypeConfiguration<CinemaPhaseMembership>
{
    public void Configure(EntityTypeBuilder<CinemaPhaseMembership> builder)
    {
        builder.ToTable("CinemaPhaseMemberships");
        builder.HasKey(member => member.Id);

        builder.HasOne(member => member.Phase)
            .WithMany(phase => phase.Members)
            .HasForeignKey(member => member.PhaseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Deleting the project drops its membership; nothing here cascades into the project.
        builder.HasOne(member => member.Project)
            .WithMany()
            .HasForeignKey(member => member.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // One primary phase per project.
        builder.HasIndex(member => member.ProjectId).IsUnique();
        builder.HasIndex(member => new { member.PhaseId, member.SortOrder });
    }
}
