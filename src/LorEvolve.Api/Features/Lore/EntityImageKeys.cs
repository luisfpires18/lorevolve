namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Where an entry's image lives in the bucket.
///
///   universes/{universeId}/entities/{entityId}/primary/{assetId}/original.{ext}
///   universes/{universeId}/entities/{entityId}/primary/{assetId}/thumbnail-{thumbnailId}.webp
///
/// R2 has no folders; a key is one flat string and the slashes are only a prefix the console
/// happens to draw as a tree. So this layout buys exactly three things - a prefix that scopes an
/// entry's objects together, an <c>{assetId}</c> segment that makes every upload a different
/// path, and a <c>{thumbnailId}</c> that makes every framing of that upload a different path.
///
/// A picture stored before framings existed has a thumbnail at <c>thumbnail.webp</c>. It is not
/// renamed: the row stores the key it was written under, so both shapes resolve.
///
/// Ids only. No username, no email, no universe name, no entry name. A bucket listing is a
/// disclosure surface even on a private bucket, and none of those belong in one: names are
/// authored content, and an id is not. It also means renaming a world or a character moves
/// nothing.
///
/// <c>{assetId}</c> is new for every upload, replacements included, and <c>{thumbnailId}</c> is
/// new for every thumbnail. Nothing is ever written over an object that is currently live, which
/// is what lets a replacement or a new framing fail without taking the working image with it -
/// and what makes a served URL immutable enough to cache.
/// </summary>
public static class EntityImageKeys
{
    public static string Prefix(Guid universeId, Guid entityId, Guid assetId) =>
        $"universes/{universeId:D}/entities/{entityId:D}/primary/{assetId:D}";

    public static string Original(Guid universeId, Guid entityId, Guid assetId, string extension) =>
        $"{Prefix(universeId, entityId, assetId)}/original.{extension}";

    public static string Thumbnail(Guid universeId, Guid entityId, Guid assetId, Guid thumbnailId) =>
        $"{Prefix(universeId, entityId, assetId)}/thumbnail-{thumbnailId:D}.webp";
}
