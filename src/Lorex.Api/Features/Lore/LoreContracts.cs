using System.Text.Json;
using System.Text.Json.Serialization;
using Lorex.Api.Features.Media;

namespace Lorex.Api.Features.Lore;

// ---------- Entity types ----------

/// <summary>
/// <paramref name="Icon"/> is the type's icon key: null or blank for none, otherwise one of
/// <see cref="EntityTypeIcons.Keys"/>. Any other value is refused.
/// </summary>
/// <summary>
/// <paramref name="FamilyTreeEligible"/> left out keeps what is stored - so a client that predates it cannot clear it by
/// saving an icon - and is <c>false</c> on a new type (ADR 0040).
///
/// <paramref name="DisplayOrder"/> is no longer how a type is placed, and is ignored: a new type goes last among its siblings,
/// and a type moves one place at a time through <c>POST .../entity-types/{id}/move</c>. Kept so an older client's request
/// still binds.
///
/// <paramref name="Parent"/> is the type's place in the hierarchy, as a wrapper so leaving it out and choosing "no parent" are
/// different: absent keeps the stored parent - an older client saving a name cannot detach a type - while
/// <c>{ "id": null }</c> makes it a root and <c>{ "id": "…" }</c> puts it beneath that type, subtree and all. On a new type,
/// absent and <c>{ "id": null }</c> both make a root.
///
/// <paramref name="Groups"/> is the type's whole set of semantic groups (Issue #36), saved with the type in one transaction:
/// absent keeps the stored membership, so a client that predates groups cannot clear them, and an empty list leaves every
/// group. Each choice names an existing group of the universe by id, or a new one by name, which is created with the save and
/// only with it - a cancelled or refused save leaves no group behind.
/// </summary>
public sealed record EntityTypeRequest(
    string? Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    int? DisplayOrder,
    bool? FamilyTreeEligible = null,
    EntityTypeParentChoice? Parent = null,
    IReadOnlyList<EntityTypeGroupChoice>? Groups = null);

/// <summary>One group a type belongs to: an existing group by <paramref name="Id"/>, or a new one by <paramref name="Name"/>.</summary>
public sealed record EntityTypeGroupChoice(Guid? Id, string? Name = null);

/// <summary>A new name for a group. The group keeps its id, its members and every field that targets it.</summary>
public sealed record EntityTypeGroupRenameRequest(string? Name);

/// <summary>Whether a group is enabled for the Family Tree (Issue #37). Required: nothing is assumed from a missing value.</summary>
public sealed record EntityTypeGroupFamilyTreeRequest(bool? Enabled);

/// <summary>
/// A semantic group and the ids of its member types, in no meaningful order. <paramref name="FamilyTreeEnabled"/> is whether the
/// author enabled it for the Family Tree, which offers the tree for every type in it.
/// </summary>
public sealed record EntityTypeGroupResponse(Guid Id, string Name, IReadOnlyList<Guid> TypeIds, bool FamilyTreeEnabled = false);

/// <summary>Where a type sits: beneath <paramref name="Id"/>, or at the root when it is null.</summary>
public sealed record EntityTypeParentChoice(Guid? Id);

/// <summary>One step among a type's siblings: <c>"up"</c> or <c>"down"</c>.</summary>
public sealed record EntityTypeMoveRequest(string? Direction);

/// <summary>
/// Puts a type at <see cref="Index"/> (0-based) among its current direct siblings - the types with the same parent - in one
/// step. <see cref="ParentId"/> is the parent the client saw it under (null for the roots): reordering never reparents, so a
/// type whose parent has changed since is refused rather than placed by stale numbers.
/// </summary>
public sealed record EntityTypeReorderRequest(int? Index, Guid? ParentId);

/// <summary>
/// <paramref name="EntityCount"/> counts every entry of the type, the Trash included, because a trashed entry keeps its type
/// and still stops it being deleted; <paramref name="TrashedEntityCount"/> is how many of those are in the Trash. Both are
/// the type's own entries only, never its descendants'. <paramref name="ParentId"/> is the type it sits beneath, or null for
/// a root. A list of types is always in the hierarchy's order - a parent before its descendants, siblings by
/// <paramref name="DisplayOrder"/> - but a client builds the tree from the ids, never from positions.
/// <paramref name="FamilyTreeEligible"/> is the type's own switch, the one a save writes; <paramref name="FamilyTreeOffered"/>
/// is whether the Family Tree is offered for its entries - that switch, or a group enabled for the tree that the type is in
/// (Issue #37). Read only: it is changed on the type or on the group, never here.
/// </summary>
public sealed record EntityTypeResponse(
    Guid Id,
    string Name,
    string? Description,
    string? Icon,
    string? AccentColor,
    int DisplayOrder,
    int EntityCount,
    int TrashedEntityCount,
    IReadOnlyList<FieldDefinitionResponse> Fields,
    bool FamilyTreeEligible,
    Guid? ParentId = null,
    bool FamilyTreeOffered = false);

// ---------- Field definitions ----------

/// <summary>
/// <paramref name="Semantic"/> is optional and normally null: a field means nothing to
/// Lorex unless the author says it does. It is bound explicitly here, like every other
/// member, so nothing can be overposted onto the definition.
///
/// <paramref name="TargetEntityTypeId"/> is the one type a link-to-an-entry field accepts, by id; null accepts any
/// type. Only a link field may carry one.
///
/// <paramref name="TargetGroupId"/> is the semantic group a link field accepts instead: an entry of any type in that group,
/// by its membership when the link is written. Never sent with <paramref name="TargetEntityTypeId"/>.
/// </summary>
public sealed record FieldDefinitionRequest(
    string? Name,
    EntityFieldKind Kind,
    bool IsRequired,
    int? DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<string>? Options,
    EntityFieldSemantic? Semantic = null,
    Guid? TargetEntityTypeId = null,
    Guid? TargetGroupId = null);

public sealed record FieldOptionResponse(Guid Id, string Value, int DisplayOrder);

public sealed record FieldDefinitionResponse(
    Guid Id,
    string Name,
    EntityFieldKind Kind,
    bool IsRequired,
    int DisplayOrder,
    string? DefaultValue,
    IReadOnlyList<FieldOptionResponse> Options,
    EntityFieldSemantic? Semantic,
    Guid? TargetEntityTypeId = null,
    Guid? TargetGroupId = null);

// ---------- Entities ----------

/// <summary>
/// One submitted field value. Only the member matching the field kind is read.
///
/// <paramref name="EraId"/> goes with <paramref name="Number"/>: the era of the universe's
/// chronology the number is a year in. A universe that names eras requires one on a birth or
/// death year; any number may carry one; and a universe that names none refuses it.
/// </summary>
public sealed record FieldValueInput(
    Guid FieldDefinitionId,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid>? OptionIds,
    Guid? ReferencedEntityId,
    Guid? EraId = null);

/// <summary>
/// The structured half of an entry. The article is not part of it: the article is saved on its own route
/// (<see cref="EntityArticleRequest"/>), so a structured edit cannot overwrite it - and a request that still sends one
/// here is refused whole (<see cref="CarriesLegacyArticle"/>).
/// </summary>
public sealed record EntityRequest(
    Guid EntityTypeId,
    string? Name,
    string? Summary,
    CanonStatus CanonStatus,
    IReadOnlyList<string>? Aliases,
    IReadOnlyList<string>? Tags,
    IReadOnlyList<FieldValueInput>? Fields,
    int? ExpectedVersion = null)
{
    /// <summary>
    /// The <c>content</c> member an entry request carried before the article moved to its own route (ADR 0028), declared
    /// only so that its presence can be seen. The serializer skips any member a record does not declare, so without this a
    /// client still writing the article with the entry would be answered as saved and lose the article. It is matched as
    /// every member is - case-insensitively - and whatever it holds, null included, marks that client: from an old editor,
    /// null meant "clear the article". Never read as an article.
    /// </summary>
    [JsonPropertyName("content")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public JsonElement LegacyContent { get; init; }

    /// <summary>Whether the request sent the article member at all. An absent member is the only accepted shape.</summary>
    [JsonIgnore]
    public bool CarriesLegacyArticle => LegacyContent.ValueKind != JsonValueKind.Undefined;
}

/// <summary>
/// Mass create: many entries' basic shells in one all-or-nothing write. Only what a shell is - a type, a name and a Canon
/// status - so nothing else an entry holds can arrive this way. At most <see cref="EntityEndpoints.MassCreateMaxEntries"/>.
/// </summary>
public sealed record BulkEntityRequest(IReadOnlyList<BulkEntityRow?>? Entries);

/// <summary>One row of a mass create. A missing status is Idea, as a new entry's is.</summary>
public sealed record BulkEntityRow(Guid EntityTypeId, string? Name, CanonStatus CanonStatus);

/// <summary>Every entry a mass create made, in the order the rows were sent.</summary>
public sealed record BulkEntityResponse(IReadOnlyList<BulkCreatedEntity> Created);

public sealed record BulkCreatedEntity(Guid Id, string Name, Guid EntityTypeId, CanonStatus CanonStatus);

/// <summary>Moves these live entries of one universe to the Trash, all or none. At most <see cref="EntityEndpoints.BulkTrashMaxEntries"/>.</summary>
public sealed record BulkTrashRequest(IReadOnlyList<Guid>? EntityIds);

public sealed record BulkTrashResponse(int Trashed);

/// <summary>
/// <paramref name="ReferencedEntityIsTrashed"/> says the reference still points at real lore
/// that is currently in the Trash. The id and the name are still reported, deliberately: this
/// value belongs to the *live* entry holding it, and the client sends its whole field set back
/// on every save, so hiding the reference would delete it the next time the author touched an
/// unrelated field. The client greys it out instead of following it.
/// </summary>
public sealed record FieldValueResponse(
    Guid FieldDefinitionId,
    string Name,
    EntityFieldKind Kind,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    IReadOnlyList<Guid> OptionIds,
    IReadOnlyList<string> OptionValues,
    Guid? ReferencedEntityId,
    string? ReferencedEntityName,
    bool ReferencedEntityIsTrashed,
    Guid? EraId);

/// <summary>
/// The entry's primary image, as identity and shape - never as a URL.
///
/// The client composes <c>/api/universes/{u}/entities/{e}/image/{assetId}/{variant}</c> from
/// these, which is the same derivation on the other side of the wire and keeps the contract
/// free of anything that would go stale if the route moved. Nothing that names Cloudflare, a
/// bucket or an endpoint is ever in a response.
///
/// <paramref name="Width"/> and <paramref name="Height"/> are the original's, sent so the client
/// can reserve the right space before a byte of the image has arrived.
///
/// <paramref name="ThumbnailId"/> names the thumbnail currently cut from that original. It is in
/// the thumbnail's route for the same reason the asset id is in both: choosing a new framing makes
/// a new thumbnail with a new address, so a cached one can never be served for the wrong crop.
///
/// <paramref name="Crop"/> is the square the thumbnail was cut from. Null only for a picture
/// stored before the author chose one, whose thumbnail is the centred square.
/// </summary>
public sealed record EntityImageRef(
    Guid AssetId,
    Guid ThumbnailId,
    int Width,
    int Height,
    string ContentType,
    string? FileName,
    long ByteSize,
    DateTime UploadedAt,
    EntityImageCrop? Crop)
{
    public static EntityImageRef Of(EntityImage image) => new(
        image.AssetId,
        image.ThumbnailId,
        image.Width,
        image.Height,
        image.ContentType,
        image.FileName,
        image.ByteSize,
        image.UploadedAt,
        EntityImageCrop.Of(image));
}

/// <summary>
/// The square a thumbnail is cut from, as fractions of the original rather than pixels of any
/// screen: <paramref name="X"/> and <paramref name="Width"/> of its width, <paramref name="Y"/> and
/// <paramref name="Height"/> of its height, from the top-left corner.
///
/// Fractions are what make the crop the picture's rather than the browser's. The same four
/// numbers select the same pixels however large the cropper was drawn, and whether the server
/// is rendering the thumbnail now or an importer is regenerating it from a backup years later.
///
/// "The original" means the picture as it is displayed: after its EXIF orientation for a JPEG or
/// a PNG, and as stored for a WebP - which is how browsers draw each one, so the square an author
/// frames is the square that gets cut. <see cref="EntityImageProcessing"/> owns that rule.
/// </summary>
/// <remarks>
/// Its own record rather than <see cref="ImageCrop"/> directly, because this one is a published
/// wire and backup shape: a v3 archive holds <c>image.crop</c> and nothing may quietly change what
/// that is. The two convert in a line each, and the arithmetic lives in <see cref="ImagePreparation"/>
/// where both an entry's picture and a profile photo reach it.
/// </remarks>
public sealed record EntityImageCrop(double X, double Y, double Width, double Height)
{
    internal static EntityImageCrop? Of(EntityImage image) =>
        image is { CropX: { } x, CropY: { } y, CropWidth: { } width, CropHeight: { } height }
            ? new EntityImageCrop(x, y, width, height)
            : null;

    internal static EntityImageCrop From(ImageCrop crop) =>
        new(crop.X, crop.Y, crop.Width, crop.Height);

    internal ImageCrop ToShared() => new(X, Y, Width, Height);
}

/// <summary>
/// A new framing for the picture an entry already has.
///
/// <paramref name="AssetId"/> is the picture the author was looking at when they chose it. If the
/// image has been replaced since, the fractions describe a different picture, and the request is
/// refused rather than applied to it.
/// </summary>
public sealed record EntityThumbnailRequest(Guid AssetId, EntityImageCrop? Crop);

/// <summary>
/// Card row. Carries enough to render a type-aware card, and no universe or owner id - and never an article.
///
/// <paramref name="ArticleExcerpt"/> is set only on a search result whose article matched: a few words around the match,
/// cut by the index, as runs of text with the matched words marked. Null when browsing, and when only the name, an alias
/// or the summary matched.
/// </summary>
public sealed record EntitySummary(
    Guid Id,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    bool IsArchived,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    EntityImageRef? Image,
    DateTime UpdatedAt,
    IReadOnlyList<SearchExcerptPart>? ArticleExcerpt);

/// <summary>One run of an article excerpt: plain text as the author wrote it, and whether it is part of the match.</summary>
public sealed record SearchExcerptPart(string Text, bool IsMatch);

/// <summary>
/// An entry's structured lore. Its article is read on its own route (<see cref="EntityArticleResponse"/>).
/// <paramref name="HasFamilyConnections"/> says a live link of a family kind touches it, so an entry recorded in a family
/// before its type's eligibility existed still offers its tree (ADR 0040).
/// </summary>
public sealed record EntityDetail(
    Guid Id,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    bool IsArchived,
    Guid EntityTypeId,
    string EntityTypeName,
    string? EntityTypeIcon,
    string? EntityTypeAccentColor,
    IReadOnlyList<string> Aliases,
    IReadOnlyList<string> Tags,
    IReadOnlyList<FieldValueResponse> Fields,
    EntityImageRef? Image,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool HasFamilyConnections,
    int Version);

public sealed record EntityPage(
    IReadOnlyList<EntitySummary> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public sealed record TagResponse(Guid Id, string Name, int EntityCount);
