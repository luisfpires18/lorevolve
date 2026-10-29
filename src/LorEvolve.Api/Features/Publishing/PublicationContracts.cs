using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Features.Publishing;

// ---------- The owner's side: authenticated, owner-scoped ----------

/// <summary>
/// The public details an owner saves. Visibility is deliberately not here - it changes only through
/// publish and unpublish - and neither is the slug, which LorEvolve mints. A body carrying either has it
/// ignored, because these members are all that is bound.
///
/// Attribution (ADR 0039): <paramref name="BasedOnExternalWork"/> true says the universe is based on someone else's work,
/// and then <paramref name="OriginalCreator"/> is required and <paramref name="OriginalWork"/> optional; false says it is
/// its author's own and clears both. Left out (null), the stored attribution is kept - a client that predates it cannot
/// erase it.
/// </summary>
public sealed record PublicationDetailsRequest(
    string? PublicSummary,
    UniverseCategory? Category,
    IReadOnlyList<UniverseGenres>? Genres,
    bool? BasedOnExternalWork = null,
    string? OriginalCreator = null,
    string? OriginalWork = null);

/// <summary>
/// One universe's public face as its owner sees it in Settings: what is saved, whether it is public,
/// and what publishing it still needs (<see cref="Missing"/>, keyed as a validation problem is, in the
/// order a screen lists them). <see cref="AuthorDisplayName"/> is the owner's own public name.
/// </summary>
public sealed record PublicationState(
    string Name,
    UniverseVisibility Visibility,
    string? PublicSummary,
    UniverseCategory? Category,
    IReadOnlyList<UniverseGenres> Genres,
    string? PublicSlug,
    DateTime? PublishedAt,
    string? AuthorDisplayName,
    UniverseArtworkRef? Artwork,
    IReadOnlyDictionary<string, string[]> Missing,
    string? OriginalCreator = null,
    string? OriginalWork = null);

/// <summary>
/// The lore entries publishing this universe would make public, for its owner to review first (Issue #47): every entry
/// <see cref="PublicationRules.SelectedLore"/> answers for the universe, by name, at most
/// <see cref="PublicationEndpoints.SelectedLoreLimit"/> of them, and how many there are in all. A private universe's entry
/// pages do not show that choice, so this is where the owner sees it.
/// </summary>
public sealed record SelectedLore(int TotalCount, IReadOnlyList<SelectedLoreEntry> Items);

/// <summary>One selected entry as the confirmation names it: its name and its type's name.</summary>
public sealed record SelectedLoreEntry(Guid Id, string Name, string TypeName);

/// <summary>
/// The artwork as its owner's client needs it: ids to compose the owner-only addresses of the
/// original and the card from, the picture's shape, and the frame to reopen the cropper on. No key
/// and no URL, as with every other picture (ADR 0019).
/// </summary>
public sealed record UniverseArtworkRef(
    Guid AssetId,
    Guid CardId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt,
    ImageCrop Crop)
{
    public static UniverseArtworkRef Of(UniverseArtwork artwork) => new(
        artwork.AssetId,
        artwork.CardId,
        artwork.Width,
        artwork.Height,
        artwork.ContentType,
        artwork.FileName,
        artwork.ByteSize,
        artwork.UploadedAt,
        new ImageCrop(artwork.CropX, artwork.CropY, artwork.CropWidth, artwork.CropHeight));
}

/// <summary>A new card frame for the artwork already stored; refused if the artwork was replaced since.</summary>
public sealed record UniverseArtworkCardRequest(Guid AssetId, ImageCrop? Crop);

/// <summary>
/// One lore entry's or story's publication, as its owner sees it: whether they selected it, its address and first
/// publication date once it has them, and whether its universe is public now - so a screen can say "public" or
/// "selected, but the universe is private" without the author having to work it out. The item is public to anyone
/// exactly when <see cref="Visibility"/> is <c>Public</c> and <see cref="UniverseIsPublic"/> is true - and, for a
/// story, when it has its <see cref="PublicSummary"/> (Task 011). Always null for a lore entry.
/// </summary>
public sealed record ContentPublicationState(
    ContentVisibility Visibility,
    string? PublicSlug,
    DateTime? PublishedAt,
    bool UniverseIsPublic,
    string? PublicSummary = null);

/// <summary>
/// One part of a story - a scene's outline, a scene's manuscript or a plot arc - as its owner sees its publication (ADR
/// 0039): whether they selected it, and whether its story is public to anyone now (story selected, with its public summary,
/// in a public universe). The part is public exactly when both are. Parts have no address of their own: they are read on
/// their story's page.
/// </summary>
public sealed record StoryPartPublicationState(ContentVisibility Visibility, bool StoryIsPublic);

/// <summary>
/// A story's public summary as its owner saves it, on its publication route and nowhere else. Visibility, address and
/// date are not here: a body carrying them has them ignored.
/// </summary>
public sealed record StoryPublicationRequest(string? PublicSummary);

/// <summary>
/// Where the signed-in owner edits what a public address shows (Task 011): the ids of their own universe and, when
/// asked, of the entry or story at a child address. Answered only to that owner; everyone else gets a 404, so it says
/// nothing about who owns a world.
/// </summary>
public sealed record WorkspaceLink(Guid UniverseId, Guid? EntityId, Guid? StoryId);

// ---------- The public side: anonymous ----------

/// <summary>
/// A public universe, as anyone may read it. <b>An allow-list</b>: every member here was chosen to be
/// public, and it is built by a projection that names each one - never by serialising a universe and
/// leaving things out - so a property added to <c>Universe</c> can never reach this by accident. No
/// id, no owner, no username or email, no description, no colour, no audit dates, no object key.
/// <see cref="AuthorSlug"/> is the author's public address (ADR 0037), never an account id.
///
/// <see cref="OriginalCreator"/> and <see cref="OriginalWork"/> (ADR 0039) are the only nullable members: set when the author
/// says the universe is based on someone else's work, and then the author is that work's curator on LorEvolve, not its creator.
/// The original creator is a name, never a LorEvolve account, and nothing links it to one.
///
/// Every other member is never null: the public query only returns universes that have all of them.
/// <see cref="Genres"/> are in their one fixed order. <see cref="CardImageUrl"/> is a same-origin
/// path that answers only while the universe is public. <see cref="PublishedAt"/> is when it was first
/// published.
/// </summary>
public sealed record PublicUniverse(
    string Slug,
    string Name,
    string PublicSummary,
    UniverseCategory Category,
    IReadOnlyList<UniverseGenres> Genres,
    string AuthorDisplayName,
    string AuthorSlug,
    string CardImageUrl,
    DateTime PublishedAt,
    string? OriginalCreator,
    string? OriginalWork);

/// <summary>One page of the public listing, most recently published first.</summary>
public sealed record PublicUniversePage(
    IReadOnlyList<PublicUniverse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

/// <summary>
/// A published lore entry, as anyone may list it (Task 010). <b>An allow-list</b>, projected member by member like
/// <see cref="PublicUniverse"/>: no id, no universe or owner, no Canon status, fields, aliases, tags, relationships,
/// history, article or storage key. <see cref="Summary"/> is the entry's own one-or-two-line lead, null when it has
/// none. <see cref="TypeName"/> is the name of its type. <see cref="ThumbnailUrl"/> is a same-origin path to its
/// square thumbnail - never the original - that answers only while the entry is public, or null when it has no
/// picture. <see cref="PublishedAt"/> is its first publication.
/// </summary>
public sealed record PublicLoreEntry(
    string Slug,
    string Name,
    string? Summary,
    string TypeName,
    string? ThumbnailUrl,
    DateTime PublishedAt);

/// <summary>
/// A published story, as anyone may read it - in a listing and at its own address alike (Tasks 010-011): its address,
/// title, the public summary its author wrote for readers, and its first publication. Nothing else - not its premise,
/// which is the author's planning text, and nothing inside it: no chapter, scene, manuscript, plot, point of view, lore
/// reference or note.
/// </summary>
public sealed record PublicStory(
    string Slug,
    string Title,
    string PublicSummary,
    DateTime PublishedAt);

/// <summary>
/// A published story's own page (Task 011; its content since Product refinement 015, ADR 0039): what
/// <see cref="PublicStory"/> lists, plus exactly what its author published inside it, in the author's order. Each list
/// holds only what is effectively public and says nothing of what is not - no count, no gap, no placeholder.
/// <see cref="Manuscript"/> is the prose of the scenes whose manuscript was published, in reading order, empty prose left
/// out; <see cref="Scenes"/> the outlines of the scenes published as such, in reading order; <see cref="Plot"/> the arcs
/// published on purpose, in arc order, each with its live beats. No ids, notes, chapters, points of view, dates, lore links,
/// scene or beat links, premise or status.
/// </summary>
public sealed record PublicStoryDetail(
    string Slug,
    string Title,
    string PublicSummary,
    DateTime PublishedAt,
    IReadOnlyList<PublicManuscriptPart> Manuscript,
    IReadOnlyList<PublicStoryScene> Scenes,
    IReadOnlyList<PublicPlotArc> Plot);

/// <summary>
/// One scene's published prose, under the scene's title. Plain text as written, each mention as its name; <c>Links</c>
/// marks the mentions whose entry is itself published (ADR 0058 amendment), by where the name sits in <c>Text</c>.
/// </summary>
public sealed record PublicManuscriptPart(string Title, string Text, IReadOnlyList<PublicMentionLink> Links);

/// <summary>A mention's name in a part's text, in UTF-16 code units, and the published entry it opens.</summary>
public sealed record PublicMentionLink(int Start, int Length, string LoreSlug);

/// <summary>One scene's published outline: its title and summary (null when it has none).</summary>
public sealed record PublicStoryScene(string Title, string? Summary);

/// <summary>One published plot arc: its title, description, and its live beats in order. Never notes or links.</summary>
public sealed record PublicPlotArc(string Title, string? Description, IReadOnlyList<PublicPlotBeat> Beats);

public sealed record PublicPlotBeat(string Title, string? Description);

/// <summary>
/// A published lore entry's own page (Task 011): what <see cref="PublicLoreEntry"/> lists, plus its article.
/// <see cref="Article"/> is the entry's Tiptap document as a string - the one the workspace renders - with every link
/// that is not an absolute http, https or mailto address unwrapped to its text, so no workspace address or id rides
/// along; null when the entry has no article. Never its fields, aliases, tags, Canon status, relationships, history,
/// ids or the picture's original.
/// </summary>
public sealed record PublicLoreDetail(
    string Slug,
    string Name,
    string? Summary,
    string TypeName,
    string? ThumbnailUrl,
    string? Article,
    DateTime PublishedAt);

/// <summary>
/// An author, as anyone may read them (ADR 0037): their address, their public name, and their photo's public square
/// only if they chose to show it. Answered only while they have a public universe. No account id, username, email or
/// counts.
/// </summary>
public sealed record PublicAuthor(
    string Slug,
    string DisplayName,
    string? AvatarUrl);

/// <summary>One page of a public universe's published entries or stories.</summary>
public sealed record PublicContentPage<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

// ---------- The account's public name ----------

public sealed record PublicNameRequest(string? PublicDisplayName);

/// <summary>
/// The signed-in account's public author page, as its owner manages it (ADR 0037): its address once minted, whether it
/// resolves now (it has a public universe), whether there is a photo, and whether the owner chose to show it.
/// </summary>
public sealed record PublicAuthorSettings(
    string? AuthorSlug,
    bool HasPublicWorld,
    bool HasPhoto,
    bool PhotoIsPublic);

public sealed record PublicAuthorPhotoRequest(bool IsPublic);

public sealed record PublicNameResponse(string? PublicDisplayName);
