using System.Globalization;

namespace LorEvolve.Api.Features.AiChanges;

/// <summary>How the review describes a change to a project's entry, such as a game's unit.</summary>
internal static partial class AiChangeViews
{
    private static string DescribeProjectEntry(
        AiChangeAction action,
        ProjectEntryValues entry,
        ProjectEntryValues? old,
        Names names,
        Action<string, string?, string?> line)
    {
        line("Type", old is null ? null : names.EntryType(old), names.EntryType(entry));
        line("Name", old?.Name, entry.Name);
        line("Description", Filled(old?.Summary), Filled(entry.Summary));
        line("Lore entry", old?.CanonEntryId is { } was ? names.Entry(AiRef.To(was)) : null,
            entry.CanonEntryId is { } now ? names.Entry(AiRef.To(now)) : null);
        foreach (var key in entry.Fields.Concat(old?.Fields ?? []).Select(Key).Distinct())
        {
            var before = old?.Fields.FirstOrDefault(value => Key(value) == key);
            var after = entry.Fields.FirstOrDefault(value => Key(value) == key);
            line(
                names.ProjectField((after ?? before)!),
                before is null ? null : Filled(names.ProjectValue(before)),
                after is null ? null : Filled(names.ProjectValue(after)));
        }

        return action == AiChangeAction.Create
            ? $"New {names.EntryType(entry)}: {entry.Name}"
            : $"Edit {old?.Name ?? entry.Name} ({names.EntryType(old ?? entry)})";

        static string? Filled(string? text) => string.IsNullOrEmpty(text) ? null : text;
        static string Key(ProjectFieldValue value) => value.FieldRef ?? value.FieldId.ToString();
    }

    /// <summary>The entries a proposal's project entries link to, so their names are read too.</summary>
    private static IEnumerable<Guid> ProjectEntryReferences(List<AiChangeWork> works) => works
        .SelectMany(work => new[] { work.Proposed, work.Before })
        .OfType<ProjectEntryValues>()
        .SelectMany(entry => entry.Fields.Select(value => value.LinkedEntryId).Append(entry.CanonEntryId))
        .OfType<Guid>();

    private sealed partial class Names
    {
        /// <summary>A project's type an existing id names, or one this proposal creates.</summary>
        public string ProjectType(AiRef reference) => Named(reference, _projectTypes, work => (work.Proposed as ProjectTypeValues)?.Name);

        public string EntryType(ProjectEntryValues entry) =>
            ProjectType(entry.TypeRef is { } key ? new AiRef(null, key) : AiRef.To(entry.TypeId));

        public string ProjectField(ProjectFieldValue value) => value.FieldRef is { } key
            ? Named(new AiRef(null, key), _fields.ToDictionary(field => field.Key, field => field.Value.Name), work => (work.Proposed as ProjectSchemaFieldValues)?.Name)
            : _fields.TryGetValue(value.FieldId, out var field) ? field.Name : "A deleted field";

        /// <summary>A project entry's field value in words; its choices are stored as their own text.</summary>
        public string? ProjectValue(ProjectFieldValue value) =>
            value.Text
            ?? value.Number?.ToString(CultureInfo.InvariantCulture)
            ?? (value.Boolean is { } flag ? YesNo(flag) : null)
            ?? value.Date?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            ?? (value.Choices is { Count: > 0 } chosen ? string.Join(", ", chosen.Order(StringComparer.Ordinal)) : null)
            ?? (value.LinkedEntryId is { } linked ? Entry(AiRef.To(linked)) : null);

        public string ProjectParent(AiRef? reference) => reference is null ? "Nothing (top level)" : ProjectType(reference);
    }
}
