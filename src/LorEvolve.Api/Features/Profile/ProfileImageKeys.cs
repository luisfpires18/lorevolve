using System.Text.RegularExpressions;

namespace LorEvolve.Api.Features.Profile;

/// <summary>
/// Where an account's photo lives in the bucket.
///
///   users/{userId}/profile/{assetId}/original.{ext}
///   users/{userId}/profile/{assetId}/thumbnail-{thumbnailId}.webp
///
/// A sibling of the entity convention, not a branch of it: a profile photo is account data and
/// has no universe, so it must not sit under a universe prefix where a future per-universe
/// lifecycle rule or export would sweep it up with authored lore.
///
/// Ids only. No username, no email, no display name. The user id is Identity's own opaque
/// identifier - a GUID string this application generates - and it is the one thing here that did
/// not come from LorEvolve's own <c>Guid.NewGuid</c>, so <see cref="Segment"/> refuses anything that
/// is not a plain token rather than trusting it into a key.
///
/// <c>{assetId}</c> is new for every upload, replacements included, and <c>{thumbnailId}</c> is
/// new for every square cut from it. Nothing is ever written over an object that is currently
/// live, which is what lets a replacement or a reframe fail without taking the working photo with
/// it, and what makes a served URL immutable enough to cache.
/// </summary>
public static partial class ProfileImageKeys
{
    public static string Prefix(string userId, Guid assetId) =>
        $"users/{Segment(userId)}/profile/{assetId:D}";

    public static string Original(string userId, Guid assetId, string extension) =>
        $"{Prefix(userId, assetId)}/original.{extension}";

    public static string Thumbnail(string userId, Guid assetId, Guid thumbnailId) =>
        $"{Prefix(userId, assetId)}/thumbnail-{thumbnailId:D}.webp";

    /// <summary>
    /// The user id as one path segment, or an exception. Nothing reaches a key that could carry a
    /// slash, a dot-segment or anything else that would change what the key means.
    /// </summary>
    private static string Segment(string userId) =>
        SafeSegment().IsMatch(userId)
            ? userId
            : throw new InvalidOperationException("The signed-in user id is not usable as an object key.");

    [GeneratedRegex(@"^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex SafeSegment();
}
