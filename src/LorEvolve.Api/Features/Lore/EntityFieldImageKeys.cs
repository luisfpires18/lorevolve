namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// Where an image field's picture lives in the bucket, by the rules of <see cref="EntityImageKeys"/>: ids only, a new
/// <c>{assetId}</c> per upload and a new <c>{cropId}</c> per framing, nothing written over while it is live.
///
///   universes/{universeId}/entities/{entityId}/fields/{fieldId}/{assetId}/original.{ext}
///   universes/{universeId}/entities/{entityId}/fields/{fieldId}/{assetId}/crop-{cropId}.webp
/// </summary>
public static class EntityFieldImageKeys
{
    private static string Prefix(Guid universeId, Guid entityId, Guid fieldId, Guid assetId) =>
        $"universes/{universeId:D}/entities/{entityId:D}/fields/{fieldId:D}/{assetId:D}";

    public static string Original(Guid universeId, Guid entityId, Guid fieldId, Guid assetId, string extension) =>
        $"{Prefix(universeId, entityId, fieldId, assetId)}/original.{extension}";

    public static string Crop(Guid universeId, Guid entityId, Guid fieldId, Guid assetId, Guid cropId) =>
        $"{Prefix(universeId, entityId, fieldId, assetId)}/crop-{cropId:D}.webp";
}
