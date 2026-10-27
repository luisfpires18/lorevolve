namespace LorEvolve.Api.Features.Publishing;

/// <summary>
/// Whether a universe can be read outside its owner's workspace (ADR 0036). Set only by the publish
/// and unpublish routes - never by a save, a restore or a migration.
/// </summary>
public enum UniverseVisibility
{
    /// <summary>Every universe starts here, and every universe written before publishing existed is here.</summary>
    Private = 0,

    /// <summary>
    /// Its public shell - name, public summary, category, genres, card artwork and author name - may be read by
    /// anyone. Nothing inside it is published by this.
    /// </summary>
    Public = 1,
}

/// <summary>
/// Whether one lore entry, story, scene, scene manuscript or plot arc is selected for the public portal (ADR 0036, Task
/// 010; the story's parts since Product refinement 015, ADR 0039). Set only by that
/// item's publish and unpublish routes - never by a save, a restore or a migration.
///
/// Its own type rather than <see cref="UniverseVisibility"/>, because it promises less: <c>Public</c> here is the
/// author's selection, and it is read only while the universe holding the item is public too. A private universe
/// overrides it, and it is kept while the universe is private, so republishing the universe brings back exactly the
/// items that were selected. Nothing inherits it in either direction.
/// </summary>
public enum ContentVisibility
{
    /// <summary>Every entry and story starts here, and every one written before Task 010 is here.</summary>
    Private = 0,

    /// <summary>Selected by its owner: listed publicly while its universe is public and it is not in the Trash.</summary>
    Public = 1,
}

/// <summary>
/// What a lore entry and a story share for publishing, so one transition serves both: the author's selection, the
/// address minted the first time, and when that was. Never bound from a request.
/// </summary>
public interface IPublishable
{
    ContentVisibility Visibility { get; set; }

    string? PublicSlug { get; set; }

    DateTime? PublishedAt { get; set; }
}

/// <summary>
/// What kind of creative property a universe belongs to: one per universe, chosen by its author and never
/// inferred. Numbered from 1, so no unset value can read as a category; null is none chosen.
/// </summary>
public enum UniverseCategory
{
    /// <summary>A world of its own, not tied to an existing medium or property.</summary>
    Original = 1,

    /// <summary>Film, television and streaming.</summary>
    MoviesAndTv = 2,

    /// <summary>Video games and interactive worlds.</summary>
    Games = 3,

    /// <summary>Novels, series and prose.</summary>
    Books = 4,

    /// <summary>Comics, manga and graphic novels.</summary>
    Comics = 5,

    /// <summary>Tabletop role-playing campaigns, systems and settings.</summary>
    TabletopAndRpg = 6,

    /// <summary>Audio drama and podcast fiction.</summary>
    Audio = 7,

    Other = 8,
}

/// <summary>
/// What kind of fiction a universe is. A closed set, chosen by the author, never inferred and never free text.
/// A universe holds a few of them as one set of bits; they are always listed in this order.
/// </summary>
[Flags]
public enum UniverseGenres
{
    None = 0,
    Fantasy = 1 << 0,
    ScienceFiction = 1 << 1,
    Adventure = 1 << 2,
    Horror = 1 << 3,
    Mystery = 1 << 4,
    Historical = 1 << 5,
    Romance = 1 << 6,
    Thriller = 1 << 7,
    Supernatural = 1 << 8,
    PostApocalyptic = 1 << 9,
    Contemporary = 1 << 10,
    Other = 1 << 11,
}

public static class PublicationLimits
{
    /// <summary>Card context and a page's opening lines - and later a search engine's snippet - not an essay.</summary>
    public const int SummaryMaxLength = 300;

    /// <summary>A card shows a world's genres, so a world names the few that describe it rather than all of them.</summary>
    public const int MaxGenres = 3;

    /// <summary>The column. A slug is at most 60 characters before a collision suffix.</summary>
    public const int SlugMaxLength = 80;

    public const int DisplayNameMaxLength = 60;

    /// <summary>An original creator's name, or a studio's: a byline, not a biography.</summary>
    public const int OriginalCreatorMaxLength = 120;

    public const int OriginalWorkMaxLength = 200;
}

/// <summary>
/// A universe's artwork: the original as uploaded, and the 16:10 card cut from it that the public portal
/// shows (<see cref="Media.ImageFrame.Card"/>). One per universe, keyed by it, on the profile photo's
/// proven path (ADR 0021): ids only in its keys, a new asset id per upload and a new card id per cut, so
/// nothing live is ever written over and a served address always names the same bytes.
///
/// Only the card is ever served publicly, and only while the universe is public. The original is its
/// owner's: it may carry what a camera wrote into it, which the card never does.
/// </summary>
public sealed class UniverseArtwork
{
    public Guid UniverseId { get; set; }

    public Guid AssetId { get; set; }

    public required string OriginalKey { get; set; }

    public Guid CardId { get; set; }

    public required string CardKey { get; set; }

    /// <summary>The 16:10 frame the card was cut from, as fractions of the displayed original.</summary>
    public double CropX { get; set; }

    public double CropY { get; set; }

    public double CropWidth { get; set; }

    public double CropHeight { get; set; }

    /// <summary>Decided by decoding the bytes, never by the file name.</summary>
    public required string ContentType { get; set; }

    /// <summary>A label only; never part of a key.</summary>
    public string? FileName { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public long ByteSize { get; set; }

    public DateTime UploadedAt { get; set; }
}

/// <summary>
/// Where a universe's artwork lives in the bucket, beside its entries' pictures and under the same
/// universe prefix - it is the world's, not the account's:
///
///   universes/{universeId}/artwork/{assetId}/original.{ext}
///   universes/{universeId}/artwork/{assetId}/card-{cardId}.webp
///
/// Ids only. The bucket stays private: nothing public ever names a key, and the card is served only
/// through LorEvolve, which asks the database whether the universe is public on every request.
/// </summary>
public static class UniverseArtworkKeys
{
    public static string Original(Guid universeId, Guid assetId, string extension) =>
        $"universes/{universeId:D}/artwork/{assetId:D}/original.{extension}";

    public static string Card(Guid universeId, Guid assetId, Guid cardId) =>
        $"universes/{universeId:D}/artwork/{assetId:D}/card-{cardId:D}.webp";
}
