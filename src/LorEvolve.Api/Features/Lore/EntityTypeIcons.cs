using System.Collections.Frozen;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The icons an entity type may carry: a closed set of keys, each naming one picture the client
/// draws from its own built-in icon set.
///
/// A key is only a picture. It says nothing about what a type is - a crown can mark a kingdom, a
/// dynasty or a card game - and nothing reads it but the screen that draws it. It is never inferred
/// from a type's name either: a type called "Kingdom" has no icon until its author picks one.
///
/// Closed because the client can only draw what it ships, and an unknown key would render as
/// nothing on one screen and as something else on the next. It is not an upload, a URL or markup,
/// which is also what keeps it out of every question about sanitising.
///
/// The first seven are the keys the starter types have always been seeded with, kept under their
/// original names so every stored type and every backup already written still names a real icon.
/// Keys added since name the picture itself. A key, once shipped, is never renamed or removed: it
/// is stored and exported. See <c>docs/architecture/decisions/0020-entity-type-icon-keys.md</c>.
/// </summary>
public static class EntityTypeIcons
{
    public static readonly FrozenSet<string> Keys = FrozenSet.ToFrozenSet<string>(
        [
            // Seeded by EntityTypeDefaults since the starter types existed.
            "character",
            "location",
            "organization",
            "event",
            "item",
            "species",
            "concept",

            // Pictures, named for what they show.
            "crown",
            "castle",
            "mountain",
            "sword",
            "shield",
            "gem",
            "leaf",
            "sparkles",
            "book",
            "ship",

            // Product refinement 020: the common gaps of a worldbuilding list, one picture each.
            "tree",
            "flame",
            "skull",
            "scroll",
            "star",
            "moon",
            "globe",
            "landmark",
            "house",
            "swords",
            "coins",
            "flask",
            "wand",
            "languages",
        ],
        StringComparer.Ordinal);

    /// <summary>Exact and case-sensitive: a key is an identifier, not something to be read loosely.</summary>
    public static bool IsKnown(string key) => Keys.Contains(key);
}
