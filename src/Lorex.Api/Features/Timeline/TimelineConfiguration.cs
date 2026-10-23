using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Timeline;

public static class TimelineLimits
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 2000;
    public const int EraLabelMaxLength = 60;

    /// <summary>Enough for a crowded scene, small enough that one request stays bounded.</summary>
    public const int MaxLinkedEntities = 100;

    /// <summary>The stories one moment may be linked to. A handful in practice; bounded so one save stays small.</summary>
    public const int MaxLinkedStories = 50;
}

public sealed class TimelineEntryConfiguration : IEntityTypeConfiguration<TimelineEntry>
{
    public void Configure(EntityTypeBuilder<TimelineEntry> builder)
    {
        builder.ToTable("TimelineEntries");
        builder.HasKey(entry => entry.Id);

        builder.Property(entry => entry.Title).IsRequired().HasMaxLength(TimelineLimits.TitleMaxLength);
        builder.Property(entry => entry.Description).HasMaxLength(TimelineLimits.DescriptionMaxLength);
        builder.Property(entry => entry.EraLabel).HasMaxLength(TimelineLimits.EraLabelMaxLength);
        builder.Property(entry => entry.CanonStatus).HasConversion<int>();
        builder.Property(entry => entry.DateKind).HasConversion<int>();

        builder.HasOne(entry => entry.Universe)
            .WithMany()
            .HasForeignKey(entry => entry.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // No action, not cascade and not set-null: an era a moment is dated in cannot quietly
        // take the moment with it or leave its year floating in no era. The chronology route
        // refuses the deletion first; this is what holds if a race gets past it. No action
        // rather than restrict so that deleting a whole universe, which cascades to its eras
        // and its moments in the same statement, is checked once the statement is done.
        builder.HasOne(entry => entry.StartEra)
            .WithMany()
            .HasForeignKey(entry => entry.StartEraId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(entry => entry.EndEra)
            .WithMany()
            .HasForeignKey(entry => entry.EndEraId)
            .OnDelete(DeleteBehavior.NoAction);

        // The same rule for a custom month: the calendar routes refuse removing a month a date is in, and this holds if a
        // race gets past them. Checked at the end of the statement, so deleting a universe still cascades.
        builder.HasOne(entry => entry.StartCalendarMonth)
            .WithMany()
            .HasForeignKey(entry => entry.StartMonthId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(entry => entry.EndCalendarMonth)
            .WithMany()
            .HasForeignKey(entry => entry.EndMonthId)
            .OnDelete(DeleteBehavior.NoAction);

        // The chronological listing is the only read that matters here, so the index
        // carries the sort itself: unknown dates are pushed last by the query, and
        // everything else is already ordered by year, month and day inside one universe.
        builder.HasIndex(entry => new
        {
            entry.UniverseId,
            entry.DateKind,
            entry.StartYear,
            entry.StartMonth,
            entry.StartDay,
        });

        builder.HasIndex(entry => new { entry.UniverseId, entry.CanonStatus });

        // The Trash lists a universe's trashed moments, newest first (ADR 0048).
        builder.HasIndex(entry => new { entry.UniverseId, entry.DeletedAt });
    }
}

public sealed class TimelineEntryLinkConfiguration : IEntityTypeConfiguration<TimelineEntryLink>
{
    public void Configure(EntityTypeBuilder<TimelineEntryLink> builder)
    {
        builder.ToTable("TimelineEntryLinks");
        builder.HasKey(link => new { link.TimelineEntryId, link.EntityId });

        builder.HasOne(link => link.TimelineEntry)
            .WithMany(entry => entry.EntityLinks)
            .HasForeignKey(link => link.TimelineEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        // A participation row means nothing once the entity is gone, and losing it must
        // not take the moment itself with it: the entry survives, one participant lighter.
        builder.HasOne(link => link.Entity)
            .WithMany()
            .HasForeignKey(link => link.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Read from the entity side too: "every moment this character appears in".
        builder.HasIndex(link => link.EntityId);
    }
}

public sealed class TimelineEntryStoryConfiguration : IEntityTypeConfiguration<TimelineEntryStory>
{
    public void Configure(EntityTypeBuilder<TimelineEntryStory> builder)
    {
        builder.ToTable("TimelineEntryStories");
        builder.HasKey(link => new { link.TimelineEntryId, link.StoryId });

        builder.HasOne(link => link.TimelineEntry)
            .WithMany(entry => entry.StoryLinks)
            .HasForeignKey(link => link.TimelineEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        // A story in the Trash is still a row, so the link stays and returns with it. Only a story deleted for good - with
        // its universe, or from the Trash - takes the link, and never the moment.
        builder.HasOne(link => link.Story)
            .WithMany()
            .HasForeignKey(link => link.StoryId)
            .OnDelete(DeleteBehavior.Cascade);

        // Read from the story side: "the moments that matter to this story".
        builder.HasIndex(link => link.StoryId);
    }
}
