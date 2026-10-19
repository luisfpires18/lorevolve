using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

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

    /// <summary>Adds any missing default type. Returns how many were created.</summary>
    public static async Task<int> EnsureAsync(
        LorexDbContext db,
        Guid universeId,
        CancellationToken cancellationToken)
    {
        var existing = await db.EntityTypes
            .Where(type => type.UniverseId == universeId)
            .Select(type => type.Name)
            .ToListAsync(cancellationToken);

        var present = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;
        var order = 0;
        var created = new Dictionary<string, Guid>(StringComparer.Ordinal);

        foreach (var (name, description, icon, accent, familyTree) in Defaults)
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

        // Only types written just now join a starter group, and only a group with a member is created.
        foreach (var (groupName, typeNames) in StarterGroups)
        {
            var memberIds = typeNames.Where(created.ContainsKey).Select(typeName => created[typeName]).ToList();
            if (memberIds.Count == 0
                || await db.EntityTypeGroups.AnyAsync(group => group.UniverseId == universeId && group.Name == groupName, cancellationToken))
            {
                continue;
            }

            var group = new EntityTypeGroup { Id = Guid.NewGuid(), UniverseId = universeId, Name = groupName, CreatedAt = now, UpdatedAt = now };
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
