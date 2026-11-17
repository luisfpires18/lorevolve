using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LorEvolve.Api.Features.ComicCollections;

/// <summary>
/// A Story Arc or an Event of one universe (#296): an ordered list of references to issue-level units of its Comic
/// projects. It only records references; no node or project is moved, copied, reparented or given a new id.
/// </summary>
public sealed class ComicCollection
{
    public Guid Id { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    /// <summary>A key of <see cref="ComicCollectionKinds.Levels"/>; fixed once created.</summary>
    public required string Kind { get; set; }

    public required string Name { get; set; }

    public string? Summary { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>The edit version (ADR 0043): 1 when created, advanced by every edit.</summary>
    public int Version { get; set; } = 1;

    public List<ComicCollectionEntry> Entries { get; set; } = [];
}

/// <summary>One node's place in a collection. The same node may sit in many collections, once in each.</summary>
public sealed class ComicCollectionEntry
{
    public Guid Id { get; set; }

    public Guid CollectionId { get; set; }

    public ComicCollection? Collection { get; set; }

    public Guid NodeId { get; set; }

    public ProjectNode? Node { get; set; }

    public int SortOrder { get; set; }
}

public static class ComicCollectionKinds
{
    public const string StoryArc = "story-arc";

    public const string Event = "event";

    /// <summary>The node levels each kind may hold. #297 adds <c>volume</c> as one more entry.</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Levels = new Dictionary<string, string[]>
    {
        [StoryArc] = ["issue", "chapter"],
        [Event] = ["issue", "chapter"],
    };

    public static bool Allows(string kind, string level) =>
        Levels.TryGetValue(kind, out var levels) && levels.Contains(level);
}

public static class ComicCollectionLimits
{
    public const int KindMaxLength = 24;

    public const int NameMaxLength = 200;

    public const int SummaryMaxLength = 4_000;

    public const int MaxCollectionsPerUniverse = 200;

    public const int MaxEntriesPerCollection = 500;
}

public sealed class ComicCollectionConfiguration : IEntityTypeConfiguration<ComicCollection>
{
    public void Configure(EntityTypeBuilder<ComicCollection> builder)
    {
        builder.ToTable("ComicCollections");
        builder.HasKey(collection => collection.Id);
        builder.Property(collection => collection.Kind).IsRequired().HasMaxLength(ComicCollectionLimits.KindMaxLength);
        builder.Property(collection => collection.Name).IsRequired().HasMaxLength(ComicCollectionLimits.NameMaxLength);
        builder.Property(collection => collection.Summary).HasMaxLength(ComicCollectionLimits.SummaryMaxLength);

        builder.HasOne(collection => collection.Universe)
            .WithMany()
            .HasForeignKey(collection => collection.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(collection => new { collection.UniverseId, collection.Kind, collection.SortOrder });
    }
}

public sealed class ComicCollectionEntryConfiguration : IEntityTypeConfiguration<ComicCollectionEntry>
{
    public void Configure(EntityTypeBuilder<ComicCollectionEntry> builder)
    {
        builder.ToTable("ComicCollectionEntries");
        builder.HasKey(entry => entry.Id);

        builder.HasOne(entry => entry.Collection)
            .WithMany(collection => collection.Entries)
            .HasForeignKey(entry => entry.CollectionId)
            .OnDelete(DeleteBehavior.Cascade);

        // Deleting the node drops its entries; nothing here cascades into the node.
        builder.HasOne(entry => entry.Node)
            .WithMany()
            .HasForeignKey(entry => entry.NodeId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(entry => new { entry.CollectionId, entry.NodeId }).IsUnique();
        builder.HasIndex(entry => new { entry.CollectionId, entry.SortOrder });
        builder.HasIndex(entry => entry.NodeId);
    }
}
