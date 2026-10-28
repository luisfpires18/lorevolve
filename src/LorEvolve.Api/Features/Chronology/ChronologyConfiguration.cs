using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.Chronology;

public static class ChronologyLimits
{
    public const int NameMaxLength = 60;

    /// <summary>A short label is written beside every year, so it has to stay short.</summary>
    public const int AbbreviationMaxLength = 12;

    /// <summary>Generous for any reckoning a story needs, small enough to stay one screen of settings.</summary>
    public const int MaxEras = 20;

    /// <summary>A protective bound on one calendar's months, not a statement about any world.</summary>
    public const int MaxMonths = 100;

    /// <summary>A protective bound on one month's length, not a statement about any world.</summary>
    public const int MaxDaysInMonth = 1000;

    /// <summary>What simple dates allow: the numeric month and day LorEvolve has always taken.</summary>
    public const int SimpleMonths = 12;

    public const int SimpleDays = 31;
}

public sealed class ChronologyCalendarConfiguration : IEntityTypeConfiguration<ChronologyCalendar>
{
    public void Configure(EntityTypeBuilder<ChronologyCalendar> builder)
    {
        builder.ToTable("ChronologyCalendars");
        builder.HasKey(calendar => calendar.Id);

        builder.HasOne(calendar => calendar.Universe)
            .WithMany()
            .HasForeignKey(calendar => calendar.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // One calendar per universe in V1. Dropping this index is the whole schema change several calendars would need.
        builder.HasIndex(calendar => calendar.UniverseId).IsUnique();
    }
}

public sealed class ChronologyCalendarMonthConfiguration : IEntityTypeConfiguration<ChronologyCalendarMonth>
{
    public void Configure(EntityTypeBuilder<ChronologyCalendarMonth> builder)
    {
        builder.ToTable("ChronologyCalendarMonths");
        builder.HasKey(month => month.Id);

        builder.Property(month => month.Name).IsRequired().HasMaxLength(ChronologyLimits.NameMaxLength);
        builder.Property(month => month.Abbreviation).HasMaxLength(ChronologyLimits.AbbreviationMaxLength);

        builder.HasOne(month => month.Calendar)
            .WithMany(calendar => calendar.Months)
            .HasForeignKey(month => month.CalendarId)
            .OnDelete(DeleteBehavior.Cascade);

        // One month per place, as for eras: the order is what a date's month ranks by.
        builder.HasIndex(month => new { month.CalendarId, month.SortOrder }).IsUnique();
    }
}

public sealed class ChronologyEraConfiguration : IEntityTypeConfiguration<ChronologyEra>
{
    public void Configure(EntityTypeBuilder<ChronologyEra> builder)
    {
        builder.ToTable("ChronologyEras");
        builder.HasKey(era => era.Id);

        builder.Property(era => era.Name).IsRequired().HasMaxLength(ChronologyLimits.NameMaxLength);
        builder.Property(era => era.Abbreviation).HasMaxLength(ChronologyLimits.AbbreviationMaxLength);
        builder.Property(era => era.Direction).HasConversion<int>();
        builder.Property(era => era.LabelPosition).HasConversion<int>();

        builder.HasOne(era => era.Universe)
            .WithMany()
            .HasForeignKey(era => era.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        // One era per position. The order is what every comparison ranks by, so two eras
        // sharing a place would make "which came first" a question with no answer.
        builder.HasIndex(era => new { era.UniverseId, era.SortOrder }).IsUnique();
    }
}
