using Lorex.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.AiChanges;

/// <summary>
/// The stored forms of schema definitions (ADR 0062), read as an AI change reads them. A type and a group carry no edit
/// version, so their form - every list sorted - is their stale-change check; a field has its own version (ADR 0043).
/// </summary>
internal static partial class AiChangeSnapshots
{
    public static async Task<TypeValues?> TypeAsync(LorexDbContext db, Guid universeId, Guid typeId, CancellationToken cancellationToken)
    {
        var row = await db.EntityTypes.AsNoTracking()
            .Where(type => type.Id == typeId && type.UniverseId == universeId)
            .Select(type => new
            {
                type.Name,
                type.Description,
                type.Icon,
                type.AccentColor,
                type.ParentId,
                Groups = db.EntityTypeGroupMembers.Where(member => member.EntityTypeId == type.Id).Select(member => member.EntityTypeGroupId).ToList(),
                type.FamilyTreeEligible,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : new TypeValues(
                row.Name,
                row.Description,
                row.Icon,
                row.AccentColor,
                row.ParentId is { } parent ? AiRef.To(parent) : null,
                [.. row.Groups.Order().Select(AiRef.To)],
                row.FamilyTreeEligible);
    }

    /// <summary>A field of a type of this universe, its version and whether it is archived; null when there is none.</summary>
    public static async Task<(FieldValues Form, int Version, bool Archived)?> FieldAsync(LorexDbContext db, Guid universeId, Guid fieldId, CancellationToken cancellationToken)
    {
        var row = await db.EntityFieldDefinitions.AsNoTracking()
            .Where(field => field.Id == fieldId && field.EntityType!.UniverseId == universeId)
            .Select(field => new
            {
                field.EntityTypeId,
                field.Name,
                field.Kind,
                field.IsRequired,
                field.DefaultValue,
                Options = field.Options.OrderBy(option => option.DisplayOrder).Select(option => option.Value).ToList(),
                field.TargetEntityTypeId,
                field.TargetGroupId,
                field.Semantic,
                field.Version,
                Archived = field.ArchivedAt != null,
            })
            .FirstOrDefaultAsync(cancellationToken);

        return row is null
            ? null
            : (new FieldValues(
                AiRef.To(row.EntityTypeId),
                row.Name,
                row.Kind,
                row.IsRequired,
                row.DefaultValue,
                row.Options,
                row.TargetEntityTypeId is { } type ? AiRef.To(type) : null,
                row.TargetGroupId is { } group ? AiRef.To(group) : null,
                row.Semantic), row.Version, row.Archived);
    }

    public static Task<GroupValues?> GroupAsync(LorexDbContext db, Guid universeId, Guid groupId, CancellationToken cancellationToken) =>
        db.EntityTypeGroups.AsNoTracking()
            .Where(group => group.Id == groupId && group.UniverseId == universeId)
            .Select(group => new GroupValues(group.Name, group.FamilyTreeEnabled))
            .FirstOrDefaultAsync(cancellationToken);
}
