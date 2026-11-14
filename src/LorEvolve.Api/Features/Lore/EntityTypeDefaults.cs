using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Localization;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Lore;

/// <summary>
/// The starter set of entity types, written once, when a universe is created. Nothing else seeds: a read never does,
/// so a starter the author deleted or renamed - or every type, deleted - stays that way (ADR 0007 amendment). The
/// insert only adds names that are missing, which at creation is all of them.
///
/// Each carries an icon key from <see cref="EntityTypeIcons"/>, written here as data. That is the
/// only way a type gets an icon it was not given by its author: nothing maps a name to one.
///
/// The same holds for Family Tree eligibility: only the starter Character row is created eligible, as data here, and
/// nothing reads a type's name to decide it (ADR 0040).
/// </summary>
public static class EntityTypeDefaults
{
    public static readonly IReadOnlyList<(string Name, string Description, string Icon, string Accent, bool FamilyTree)> Defaults =
    [
        ("Character", "People, and anything else with a will of its own.", "character", "#4f6bd6", true),
        ("Location", "Places, from a room to a continent.", "location", "#1f8f74", false),
        ("Organization", "Groups that act together: houses, guilds, armies, cults.", "organization", "#7a4bbd", false),
        ("Event", "Things that happened, and things that will.", "event", "#a8562c", false),
        ("Item", "Objects that matter enough to name.", "item", "#b3922f", false),
        ("Species", "Kinds of living thing.", "species", "#2f8fa8", false),
        ("Concept", "Ideas, forces, languages, laws, magic systems.", "concept", "#3c4a57", false),
    ];

    /// <summary>
    /// The same template in European Portuguese (ADR 0071, #109), written into a universe whose creator asked for it in
    /// Portuguese. The icon, the colour and the Family Tree flag are the same template; only the words differ, and they
    /// are the author's from the moment they are written: renaming or deleting one is an ordinary edit, and nothing
    /// translates a universe that already exists.
    /// </summary>
    private static readonly IReadOnlyList<(string Name, string Description, string Icon, string Accent, bool FamilyTree)> PortugueseDefaults =
    [
        ("Personagem", "Pessoas, e tudo o resto que tenha vontade própria.", "character", "#4f6bd6", true),
        ("Lugar", "Lugares, de uma sala a um continente.", "location", "#1f8f74", false),
        ("Organização", "Grupos que agem em conjunto: casas, guildas, exércitos, cultos.", "organization", "#7a4bbd", false),
        ("Acontecimento", "Coisas que aconteceram, e coisas que hão de acontecer.", "event", "#a8562c", false),
        ("Objeto", "Objetos que importam o suficiente para terem nome.", "item", "#b3922f", false),
        ("Espécie", "Tipos de ser vivo.", "species", "#2f8fa8", false),
        ("Conceito", "Ideias, forças, línguas, leis, sistemas de magia.", "concept", "#3c4a57", false),
    ];

    /// <summary>The starter types in <paramref name="language"/>, English for anything LorEvolve has no words for.</summary>
    public static IReadOnlyList<(string Name, string Description, string Icon, string Accent, bool FamilyTree)> DefaultsFor(string language) =>
        language == RequestLanguage.Portuguese ? PortugueseDefaults : Defaults;

    /// <summary>
    /// The starter template's semantic groups (Issue #36), each with the starter types it holds, named by the starter names
    /// above. Data for this one template, not a taxonomy: the author renames, reshapes or deletes them like any group. Only
    /// types created in the same call join one, so nothing is ever classified after the fact, and a type of any other name
    /// joins nothing. Family Tree eligibility is unaffected; it stays on the type.
    /// </summary>
    public static readonly IReadOnlyList<(string Name, string[] Types)> StarterGroups =
    [
        ("Characters", ["Character"]),
        ("Places", ["Location"]),
        ("Factions", ["Organization"]),
        ("Objects", ["Item"]),
    ];

    /// <summary>The same groups in European Portuguese, naming the Portuguese starter types (#109).</summary>
    private static readonly IReadOnlyList<(string Name, string[] Types)> PortugueseStarterGroups =
    [
        ("Personagens", ["Personagem"]),
        ("Lugares", ["Lugar"]),
        ("Facções", ["Organização"]),
        ("Objetos", ["Objeto"]),
    ];

    /// <summary>The starter groups in <paramref name="language"/>, naming that language's starter types.</summary>
    public static IReadOnlyList<(string Name, string[] Types)> StarterGroupsFor(string language) =>
        language == RequestLanguage.Portuguese ? PortugueseStarterGroups : StarterGroups;

    /// <summary>
    /// Whether a stored type is the starter Character exactly as seeded - name, description, icon and colour all untouched.
    /// The one rule that gives an existing type Family Tree eligibility it was not given by its author: the migration applies it
    /// to every row once, and a backup from before version 18 is read through it, so both upgrade paths agree. Anything
    /// else, a custom type merely called "Character" included, stays as it was (ADR 0040).
    /// </summary>
    public static bool IsUntouchedStarterCharacter(string name, string? description, string? icon, string? accentColor)
    {
        var (starterName, starterDescription, starterIcon, starterAccent, _) = Defaults[0];
        return name == starterName && description == starterDescription && icon == starterIcon && accentColor == starterAccent;
    }

    /// <summary>
    /// Adds any missing default type, in <paramref name="language"/>. Returns how many were created. The language is the
    /// creating request's and is used nowhere else: a universe is seeded once, and what it holds afterwards is the
    /// author's, whatever language they later read LorEvolve in.
    /// </summary>
    public static async Task<int> EnsureAsync(
        LorEvolveDbContext db,
        Guid universeId,
        CancellationToken cancellationToken,
        string language = RequestLanguage.English)
    {
        var existing = await db.EntityTypes
            .Where(type => type.UniverseId == universeId)
            .Select(type => type.Name)
            .ToListAsync(cancellationToken);

        var present = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;
        var order = 0;
        var created = new Dictionary<string, Guid>(StringComparer.Ordinal);

        foreach (var (name, description, icon, accent, familyTree) in DefaultsFor(language))
        {
            order++;
            if (present.Contains(name))
            {
                continue;
            }

            var id = Guid.NewGuid();
            created[name] = id;
            db.EntityTypes.Add(new EntityType
            {
                Id = id,
                UniverseId = universeId,
                Name = name,
                Description = description,
                Icon = icon,
                AccentColor = accent,
                FamilyTreeEligible = familyTree,
                DisplayOrder = order,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        // Only types written just now join a starter group, and only a group with a member is created - after any the
        // universe has, by name, as groups were listed before they had a priority.
        var nextGroup = await EntityTypeGroupEndpoints.NextOrderAsync(db, universeId, cancellationToken);
        foreach (var (groupName, typeNames) in StarterGroupsFor(language).OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase))
        {
            var memberIds = typeNames.Where(created.ContainsKey).Select(typeName => created[typeName]).ToList();
            if (memberIds.Count == 0
                || await db.EntityTypeGroups.AnyAsync(group => group.UniverseId == universeId && group.Name == groupName, cancellationToken))
            {
                continue;
            }

            var group = new EntityTypeGroup { Id = Guid.NewGuid(), UniverseId = universeId, Name = groupName, SortOrder = nextGroup++, CreatedAt = now, UpdatedAt = now };
            db.EntityTypeGroups.Add(group);
            foreach (var memberId in memberIds)
            {
                db.EntityTypeGroupMembers.Add(new EntityTypeGroupMember { EntityTypeGroupId = group.Id, EntityTypeId = memberId });
            }
        }

        if (created.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return created.Count;
    }
}
