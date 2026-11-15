using LorEvolve.Api.Features.Projects;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.ProjectEntities;

/// <summary>What a season and an episode may hold (#145).</summary>
public static class SeriesLimits
{
    /// <summary>The same bound a project, story, scene or episode title has.</summary>
    public const int NameMaxLength = 200;

    public const int SummaryMaxLength = 2_000;

    /// <summary>
    /// A script is a document, so it is bounded where a manuscript is: generous enough for an episode of television
    /// and small enough that one request cannot carry a book.
    /// </summary>
    public const int ScriptMaxLength = 400_000;

    /// <summary>How many seasons one project may hold, and how many episodes one season may.</summary>
    public const int MaxSeasonsPerProject = 100;

    public const int MaxEpisodesPerSeason = 500;
}

public sealed class ProjectSeasonConfiguration : IEntityTypeConfiguration<ProjectSeason>
{
    public void Configure(EntityTypeBuilder<ProjectSeason> builder)
    {
        builder.ToTable("ProjectSeasons");
        builder.HasKey(season => season.Id);

        builder.Property(season => season.Name).IsRequired().HasMaxLength(SeriesLimits.NameMaxLength);
        builder.Property(season => season.Summary).HasMaxLength(SeriesLimits.SummaryMaxLength);

        // A season belongs to its project and goes with it, as a project goes with its universe (#171).
        builder.HasOne(season => season.Project)
            .WithMany()
            .HasForeignKey(season => season.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        // The listing's own shape: one project's seasons in their places.
        builder.HasIndex(season => new { season.ProjectId, season.SortOrder });

        // One name once per project, so two seasons cannot both be "Season 1" and leave an author guessing which is
        // which. Names are free text, so this is the only thing keeping a list readable.
        builder.HasIndex(season => new { season.ProjectId, season.Name }).IsUnique();
    }
}

public sealed class ProjectEpisodeConfiguration : IEntityTypeConfiguration<ProjectEpisode>
{
    public void Configure(EntityTypeBuilder<ProjectEpisode> builder)
    {
        builder.ToTable("ProjectEpisodes");
        builder.HasKey(episode => episode.Id);

        builder.Property(episode => episode.Title).IsRequired().HasMaxLength(SeriesLimits.NameMaxLength);
        builder.Property(episode => episode.Synopsis).HasMaxLength(SeriesLimits.SummaryMaxLength);
        builder.Property(episode => episode.Script).HasMaxLength(SeriesLimits.ScriptMaxLength);

        builder.HasOne(episode => episode.Season)
            .WithMany(season => season.Episodes)
            .HasForeignKey(episode => episode.SeasonId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(episode => new { episode.SeasonId, episode.SortOrder });

        // Unlike a season's name, an episode title is not unique: two seasons may each have a "Pilot", and even inside
        // one season an author may be drafting two episodes under the same working title.
    }
}
