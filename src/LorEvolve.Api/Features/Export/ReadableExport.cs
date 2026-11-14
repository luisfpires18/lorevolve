using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Timeline;

namespace LorEvolve.Api.Features.Export;

/// <summary>
/// The readable export (issue #11, ADR 0063): one universe as Markdown pages a person can open in any editor, with every
/// live picture's original beside them. Rendered from the same snapshot a backup is (<see cref="UniverseBackupBuilder"/>), so
/// it can never show something the backup does not hold, and from the payload alone - nothing here reads the database.
///
/// It is for reading, not for restoring: nothing reads it back, and it leaves out the Trash and every saved version, which the
/// backup carries. Layout: <c>README.md</c> (the universe and the contents), <c>lore/README.md</c> and
/// <c>lore/{type}/{entry}.md</c>, <c>relationships.md</c>, <c>timeline.md</c>, <c>stories/{story}/README.md</c> and
/// <c>stories/{story}/{NNN}-{scene}.md</c>, <c>maps/{map}.md</c>, <c>world-rules.md</c>, <c>ideas.md</c>, and
/// <c>media/...</c> at exactly the paths <see cref="BackupArchive"/> gives the same pictures in a backup.
///
/// File names are names reduced to lowercase letters, digits and hyphens; when two in one folder would match, both take the
/// first eight hex digits of their id. Every page links the others by relative path, so the folder works offline.
/// </summary>
public static class ReadableExport
{
    /// <summary>The layout version the README states. A change to where pages sit is a new number.</summary>
    public const int LayoutVersion = 1;

    public const string MediaType = "application/zip";

    public static string FileNameFor(string universeName, DateTime generatedAt) =>
        UniverseExportEndpoints.FileNameFor(universeName, generatedAt).Replace(".zip", "-readable.zip", StringComparison.Ordinal);

    /// <summary>
    /// Built whole in memory, as a backup is, so a picture the store cannot produce is a refusal before any byte is sent
    /// (<see cref="BackupMediaMissingException"/>), never an export that quietly lacks it.
    /// </summary>
    public static async Task<byte[]> WriteAsync(
        UniverseBackupSnapshot snapshot,
        DateTime generatedAt,
        Func<string, CancellationToken, Task<Stream?>> readObject,
        string language,
        CancellationToken cancellationToken)
    {
        var book = new ReadableBook(snapshot.Payload, generatedAt, ReadableWords.For(language));
        var pages = book.Render();

        using var buffer = new MemoryStream();
        using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (path, text) in pages.OrderBy(page => page.Key, StringComparer.Ordinal))
            {
                var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
                entry.LastWriteTime = BackupArchive.Timestamp;
                await using var writing = entry.Open();
                await writing.WriteAsync(Encoding.UTF8.GetBytes(text), cancellationToken);
            }

            await UniverseBackupArchiveWriter.WriteMediaAsync(
                archive,
                snapshot.Media.Where(item => book.MediaUsed.Contains(item.ArchivePath)),
                readObject,
                cancellationToken);
        }

        return buffer.ToArray();
    }
}

/// <summary>Renders one payload into pages. Live content only; links resolve to live pages or fall back to plain names.</summary>
internal sealed class ReadableBook
{
    private const string LoreIndex = "lore/README.md";
    private const string RelationshipsPage = "relationships.md";
    private const string TimelinePage = "timeline.md";
    private const string WorldRulesPage = "world-rules.md";
    private const string IdeasPage = "ideas.md";

    private static readonly string[] AllowedLinkSchemes = ["http", "https", "mailto"];

    /// <summary>Names Windows refuses as a file whatever the extension.</summary>
    private static readonly HashSet<string> ReservedNames = new(StringComparer.Ordinal)
    {
        "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    };

    private readonly UniverseBackupPayload _payload;
    private readonly DateTime _generatedAt;

    /// <summary>LorEvolve's own words, in the language the request asked for (#110). Never the author's text.</summary>
    private readonly ReadableWords _w;
    private readonly Dictionary<string, string> _pages = new(StringComparer.Ordinal);

    private readonly Dictionary<Guid, BackupEntityType> _types;
    private readonly Dictionary<Guid, BackupFieldDefinition> _fields;
    private readonly Dictionary<Guid, BackupEntity> _entities;
    private readonly Dictionary<Guid, BackupChronologyEra> _eras;
    private readonly Dictionary<Guid, BackupChronologyCalendarMonth> _months;
    private readonly Dictionary<Guid, BackupRelationshipType> _relationshipTypes;
    private readonly Dictionary<Guid, BackupTimelineEntry> _moments;
    private readonly Dictionary<Guid, string> _terms;
    private readonly Dictionary<Guid, string> _tags;
    private readonly Dictionary<Guid, (BackupStory Story, BackupScene Scene)> _scenes;
    private readonly Dictionary<Guid, BackupEntityEra> _entityEras;

    private readonly Dictionary<Guid, string> _entityPaths = [];
    private readonly Dictionary<Guid, string> _storyPaths = [];
    private readonly Dictionary<Guid, string> _scenePaths = [];
    private readonly Dictionary<Guid, string> _mapPaths = [];

    public ReadableBook(UniverseBackupPayload payload, DateTime generatedAt, ReadableWords words)
    {
        _payload = payload;
        _generatedAt = generatedAt;
        _w = words;

        _types = payload.EntityTypes.ToDictionary(type => type.Id);
        _fields = payload.EntityTypes.SelectMany(type => type.Fields).ToDictionary(field => field.Id);
        _entities = payload.Entities.Where(entity => entity.DeletedAt is null).ToDictionary(entity => entity.Id);
        _eras = (payload.ChronologyEras ?? []).ToDictionary(era => era.Id);
        _months = (payload.ChronologyCalendar?.Months ?? []).ToDictionary(month => month.Id);
        _relationshipTypes = payload.RelationshipTypes.ToDictionary(type => type.Id);
        _moments = payload.TimelineEntries.Where(moment => moment.DeletedAt is null).ToDictionary(moment => moment.Id);
        _terms = (payload.ValidationTerms ?? []).ToDictionary(term => term.Id, term => term.Name);
        _tags = payload.Tags.ToDictionary(tag => tag.Id, tag => tag.Name);
        _scenes = LiveStories()
            .SelectMany(story => LiveScenes(story).Select(scene => (Story: story, Scene: scene)))
            .ToDictionary(pair => pair.Scene.Id);
        _entityEras = _entities.Values
            .SelectMany(entity => entity.Progression?.Eras ?? [])
            .ToDictionary(era => era.Id);
    }

    /// <summary>The archive paths of every picture a page shows: the only media the export writes.</summary>
    public HashSet<string> MediaUsed { get; } = new(StringComparer.Ordinal);

    public Dictionary<string, string> Render()
    {
        PlanPaths();

        _pages["README.md"] = Readme();
        _pages[LoreIndex] = LoreReadme();
        foreach (var entity in _entities.Values)
        {
            _pages[_entityPaths[entity.Id]] = EntityPage(entity);
        }

        _pages[RelationshipsPage] = Relationships();
        _pages[TimelinePage] = TimelineReadme();
        foreach (var story in LiveStories())
        {
            _pages[_storyPaths[story.Id]] = StoryPage(story);
            foreach (var scene in LiveScenes(story))
            {
                _pages[_scenePaths[scene.Id]] = ScenePage(story, scene);
            }
        }

        foreach (var map in _payload.Maps ?? [])
        {
            _pages[_mapPaths[map.Id]] = MapPage(map);
        }

        _pages[WorldRulesPage] = WorldRules();
        _pages[IdeasPage] = Ideas();
        return _pages;
    }

    // ---------- Paths ----------

    private void PlanPaths()
    {
        var typeFolders = UniqueSlugs(_payload.EntityTypes.Select(type => (type.Id, type.Name)), "type");
        foreach (var group in _entities.Values.GroupBy(entity => entity.EntityTypeId))
        {
            var names = UniqueSlugs(group.Select(entity => (entity.Id, entity.Name)), "entry");
            var folder = typeFolders.GetValueOrDefault(group.Key, "untyped");
            foreach (var entity in group)
            {
                _entityPaths[entity.Id] = $"lore/{folder}/{names[entity.Id]}.md";
            }
        }

        var storyFolders = UniqueSlugs(LiveStories().Select(story => (story.Id, story.Title)), "story");
        foreach (var story in LiveStories())
        {
            _storyPaths[story.Id] = $"stories/{storyFolders[story.Id]}/README.md";
            var number = 0;
            foreach (var scene in LiveScenes(story))
            {
                number++;
                _scenePaths[scene.Id] = $"stories/{storyFolders[story.Id]}/{number:000}-{Slug(scene.Title, "scene")}.md";
            }
        }

        var maps = UniqueSlugs((_payload.Maps ?? []).Select(map => (map.Id, map.Name)), "map");
        foreach (var map in _payload.Maps ?? [])
        {
            _mapPaths[map.Id] = $"maps/{maps[map.Id]}.md";
        }
    }

    /// <summary>Lowercase letters, digits and single hyphens, at most 60 characters; never a name Windows reserves.</summary>
    internal static string Slug(string name, string fallback)
    {
        var slug = new StringBuilder(60);
        foreach (var character in name)
        {
            if (slug.Length == 60)
            {
                break;
            }

            if (char.IsLetterOrDigit(character))
            {
                slug.Append(char.ToLowerInvariant(character));
            }
            else if (slug.Length > 0 && slug[^1] != '-')
            {
                slug.Append('-');
            }
        }

        var result = slug.ToString().Trim('-');
        result = result.Length > 0 ? result : fallback;
        return ReservedNames.Contains(result) ? $"{result}-" : result;
    }

    /// <summary>Each id's slug; where a slug is shared in one folder, every holder takes its id's first eight hex digits.</summary>
    private static Dictionary<Guid, string> UniqueSlugs(IEnumerable<(Guid Id, string Name)> items, string fallback)
    {
        var slugs = items.Select(item => (item.Id, Slug: Slug(item.Name, fallback))).ToList();
        var shared = slugs.GroupBy(item => item.Slug, StringComparer.Ordinal)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.Ordinal);
        return slugs.ToDictionary(
            item => item.Id,
            item => shared.Contains(item.Slug) ? $"{item.Slug}-{item.Id:N}"[..(item.Slug.Length + 9)] : item.Slug);
    }

    /// <summary>A relative link from one page to another (or to a picture), forward slashes only.</summary>
    internal static string Relative(string from, string to)
    {
        var fromDirectory = from.Split('/')[..^1];
        var target = to.Split('/');
        var common = 0;
        while (common < fromDirectory.Length && common < target.Length - 1 && fromDirectory[common] == target[common])
        {
            common++;
        }

        return string.Concat(Enumerable.Repeat("../", fromDirectory.Length - common)) + string.Join('/', target[common..]);
    }

    private IEnumerable<BackupStory> LiveStories() =>
        (_payload.Stories ?? []).Where(story => story.DeletedAt is null);

    private static IEnumerable<BackupScene> LiveScenes(BackupStory story) =>
        story.Scenes.Where(scene => scene.DeletedAt is null);

    // ---------- Links and names ----------

    private string EntityLink(string from, Guid id) =>
        _entities.TryGetValue(id, out var entity)
            ? Link(entity.Name, Relative(from, _entityPaths[id]))
            : _payload.Entities.FirstOrDefault(candidate => candidate.Id == id) is { } trashed
                ? $"{Inline(trashed.Name)}{_w.InTheTrashSuffix}"
                : _w.EntryNotExported;

    private string SceneLink(string from, Guid id) =>
        _scenes.TryGetValue(id, out var scene)
            ? Link(scene.Scene.Title, Relative(from, _scenePaths[id]))
            : _w.SceneInTrash;

    private string StoryLink(string from, Guid id) =>
        _storyPaths.TryGetValue(id, out var path)
            ? Link(LiveStories().First(story => story.Id == id).Title, Relative(from, path))
            : _w.StoryInTrash;

    private string MomentName(Guid id) =>
        _moments.TryGetValue(id, out var moment) ? $"{Inline(moment.Title)} ({Moment(moment)})" : _w.MomentInTrash;

    private static string Link(string text, string target) => $"[{Inline(text)}]({target})";

    private string Image(string from, string alt, string mediaPath)
    {
        MediaUsed.Add(mediaPath);
        return $"![{Inline(alt)}]({Relative(from, mediaPath)})";
    }

    private static string Links(IEnumerable<string> links) => string.Join(", ", links);

    // ---------- Pages ----------

    private string Readme()
    {
        const string page = "README.md";
        var universe = _payload.Universe;
        var text = new StringBuilder();
        text.Append("# ").AppendLine(Inline(universe.Name)).AppendLine();

        if (universe.IsArchived)
        {
            text.AppendLine(_w.ArchivedUniverse).AppendLine();
        }

        Paragraph(text, universe.Description);

        text.Append(_w.TakenPrefix)
            .Append(_generatedAt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture))
            .Append(_w.LayoutPrefix).Append(ReadableExport.LayoutVersion).Append(_w.BackupFormatPrefix)
            .Append(UniverseBackup.CurrentVersion).AppendLine(").")
            .AppendLine(_w.ForReadingLine)
            .AppendLine(_w.BackupHintLine)
            .AppendLine();

        if (universe.Artwork is { } artwork)
        {
            text.AppendLine(Image(page, $"{universe.Name} {_w.Artwork}", artwork.MediaPath)).AppendLine();
        }

        Field(text, _w.PublicSummary, universe.PublicSummary);
        Field(text, _w.Category, universe.Category is { } category ? _w.CategoryOf(category) : null);
        Field(text, _w.Genres, universe.Genres is { Count: > 0 } genres ? string.Join(", ", genres.Select(_w.GenreOf)) : null);
        Field(text, _w.BasedOn, Join(" - ", universe.OriginalWork, universe.OriginalCreator));

        var stories = LiveStories().ToList();
        var maps = _payload.Maps ?? [];
        text.Append("## ").AppendLine(_w.Contents).AppendLine()
            .AppendLine($"- {Link(_w.Lore, LoreIndex)} - {_entities.Count}{_w.EntriesInPrefix}{_payload.EntityTypes.Count}{_w.TypesSuffix}")
            .AppendLine($"- {Link(_w.Relationships, RelationshipsPage)} - {LiveRelationships().Count()}")
            .AppendLine($"- {Link(_w.Timeline, TimelinePage)} - {_moments.Count}{_w.MomentsSuffix}")
            .AppendLine($"- {Link(_w.WorldRules, WorldRulesPage)} - {LiveRules().Count()}")
            .AppendLine($"- {Link(_w.Ideas, IdeasPage)} - {LiveIdeas().Count()}")
            .AppendLine($"- {_w.Stories} - {stories.Count}");
        foreach (var story in stories)
        {
            text.AppendLine($"  - {Link(story.Title, _storyPaths[story.Id])}");
        }

        text.AppendLine($"- {_w.Maps} - {maps.Count}");
        foreach (var map in maps)
        {
            text.AppendLine($"  - {Link(map.Name, _mapPaths[map.Id])}");
        }

        var trashed = _payload.Entities.Count(entity => entity.DeletedAt is not null)
            + (_payload.Stories ?? []).Count(story => story.DeletedAt is not null)
            + (_payload.Stories ?? []).Where(story => story.DeletedAt is null).Sum(story => story.Scenes.Count(scene => scene.DeletedAt is not null))
            + _payload.Relationships.Count(relationship => relationship.DeletedAt is not null)
            + _payload.TimelineEntries.Count(moment => moment.DeletedAt is not null)
            + (_payload.WorldRules ?? []).Count(rule => rule.DeletedAt is not null)
            + (_payload.Ideas ?? []).Count(idea => idea.DeletedAt is not null);

        text.AppendLine()
            .Append("## ").AppendLine(_w.NotInThisExport).AppendLine()
            .AppendLine(string.Format(CultureInfo.InvariantCulture, _w.TrashLine, trashed))
            .AppendLine(_w.SavedVersionsLine)
            .AppendLine(_w.AccountsLine)
            .AppendLine(_w.DerivedLine)
            .AppendLine(_w.LooseIdeasLine)
            .AppendLine()
            .Append("## ").AppendLine(_w.Pictures).AppendLine()
            .AppendLine(_w.PicturesLineA)
            .AppendLine(_w.PicturesLineB)
            .AppendLine(_w.PicturesLineC)
            .AppendLine("`media/universe/artwork/original.{ext}`.");

        return text.ToString();
    }

    private string LoreReadme()
    {
        var text = new StringBuilder($"# {_w.Lore}\n\n");
        var children = _payload.EntityTypes.ToLookup(type => type.ParentId);

        void Type(BackupEntityType type, int depth)
        {
            var indent = new string(' ', depth * 2);
            text.Append(indent).Append("- **").Append(Inline(type.Name)).AppendLine("**");
            foreach (var entity in _entities.Values.Where(entity => entity.EntityTypeId == type.Id)
                         .OrderBy(entity => entity.Name, StringComparer.Ordinal).ThenBy(entity => entity.Id))
            {
                text.Append(indent).Append("  - ").Append(Link(entity.Name, Relative(LoreIndex, _entityPaths[entity.Id])))
                    .AppendLine(entity.IsArchived ? _w.Archived : string.Empty);
            }

            foreach (var child in children[type.Id].OrderBy(child => child.DisplayOrder).ThenBy(child => child.Name, StringComparer.Ordinal))
            {
                Type(child, depth + 1);
            }
        }

        foreach (var root in children[null].OrderBy(type => type.DisplayOrder).ThenBy(type => type.Name, StringComparer.Ordinal))
        {
            Type(root, 0);
        }

        if (_payload.EntityTypeGroups is { Count: > 0 } groups)
        {
            text.AppendLine().Append("## ").AppendLine(_w.Groups).AppendLine();
            foreach (var group in groups)
            {
                text.Append("- **").Append(Inline(group.Name)).Append("**: ")
                    .AppendLine(string.Join(", ", group.TypeIds.Where(_types.ContainsKey).Select(id => Inline(_types[id].Name))));
            }
        }

        return text.ToString();
    }

    private string EntityPage(BackupEntity entity)
    {
        var page = _entityPaths[entity.Id];
        var type = _types[entity.EntityTypeId];
        var text = new StringBuilder();
        text.Append("# ").AppendLine(Inline(entity.Name)).AppendLine();
        text.Append('*').Append(Inline(type.Name)).Append("* - ").Append(_w.StatusOf(entity.CanonStatus))
            .AppendLine(entity.IsArchived ? _w.ArchivedDash : string.Empty).AppendLine();

        Field(text, _w.AlsoKnownAs, entity.Aliases.Count > 0 ? string.Join(", ", entity.Aliases) : null);
        Field(text, _w.Tags, entity.TagIds.Count > 0 ? string.Join(", ", entity.TagIds.Where(_tags.ContainsKey).Select(id => _tags[id])) : null);

        if (entity.Image is { } image)
        {
            text.AppendLine(Image(page, entity.Name, image.MediaPath)).AppendLine();
        }

        Paragraph(text, entity.Summary);
        Details(text, page, type, entity.FieldValues);

        if (Article(entity.Content) is { Length: > 0 } article)
        {
            text.Append("## ").AppendLine(_w.Article).AppendLine().AppendLine(article).AppendLine();
        }

        var links = LiveRelationships()
            .Where(relationship => relationship.SourceEntityId == entity.Id || relationship.TargetEntityId == entity.Id)
            .ToList();
        if (links.Count > 0)
        {
            text.Append("## ").AppendLine(_w.Relationships).AppendLine();
            foreach (var relationship in links)
            {
                var kind = _relationshipTypes[relationship.RelationshipTypeId];
                var outgoing = relationship.SourceEntityId == entity.Id;
                var other = outgoing ? relationship.TargetEntityId : relationship.SourceEntityId;
                var name = outgoing || kind.IsSymmetric ? kind.Name : kind.InverseName ?? kind.Name;
                text.Append("- ").Append(Inline(name)).Append(' ').Append(EntityLink(page, other))
                    .Append(" - ").Append(_w.StatusOf(relationship.CanonStatus));
                AppendPeriods(text, relationship);
                text.AppendLine(relationship.Notes is { Length: > 0 } notes ? $" - {Inline(notes)}" : string.Empty);
            }

            text.AppendLine();
        }

        var moments = _moments.Values.Where(moment => moment.ParticipantEntityIds.Contains(entity.Id)).OrderBy(MomentOrder).ToList();
        if (moments.Count > 0)
        {
            text.Append("## ").AppendLine(_w.Timeline).AppendLine();
            foreach (var moment in moments)
            {
                text.Append("- ").Append(Inline(moment.Title)).Append(" - ").AppendLine(Moment(moment));
            }

            text.AppendLine().AppendLine($"{_w.AllMomentsPrefix}{Link(_w.Timeline, Relative(page, TimelinePage))}.").AppendLine();
        }

        var scenes = _scenes.Values
            .Where(pair => pair.Scene.PovEntityId == entity.Id || pair.Scene.LinkedEntityIds.Contains(entity.Id))
            .ToList();
        if (scenes.Count > 0)
        {
            text.Append("## ").AppendLine(_w.Scenes).AppendLine();
            foreach (var (story, scene) in scenes)
            {
                text.Append("- ").Append(SceneLink(page, scene.Id)).Append(_w.InInfix).Append(Inline(story.Title))
                    .AppendLine(scene.PovEntityId == entity.Id ? _w.PointOfViewNote : string.Empty);
            }

            text.AppendLine();
        }

        if (entity.Progression is { } progression)
        {
            Progression(text, page, progression);
        }

        Knowledge(text, page, entity.Id);

        var pins = (_payload.Maps ?? []).SelectMany(map => map.Pins.Where(pin => pin.EntityId == entity.Id).Select(pin => (map, pin))).ToList();
        if (pins.Count > 0)
        {
            text.Append("## ").AppendLine(_w.OnMaps).AppendLine();
            foreach (var (map, pin) in pins)
            {
                text.Append("- ").Append(Link(map.Name, Relative(page, _mapPaths[map.Id]))).Append(": ").AppendLine(Inline(pin.Title));
            }

            text.AppendLine();
        }

        if (entity.PrivateNote is { Content.Length: > 0 } note)
        {
            text.Append("## ").AppendLine(_w.PrivateNote).AppendLine()
                .AppendLine(_w.OwnerOnlyLine).AppendLine();
            Paragraph(text, note.Content);
        }

        return text.ToString();
    }

    private void Details(StringBuilder text, string page, BackupEntityType type, IReadOnlyList<BackupFieldValue> values)
    {
        var byField = values.ToLookup(value => value.FieldDefinitionId);

        // The fields inherited from every type above this one come first, root first, then the type's own (ADR 0007
        // amendment, 2026-11-12); each type's fields in its own layout.
        var chain = new List<BackupEntityType> { type };
        while (chain[^1].ParentId is { } parentId && _types.TryGetValue(parentId, out var parent) && !chain.Contains(parent))
        {
            chain.Add(parent);
        }

        chain.Reverse();
        var sections = chain.SelectMany(owner => owner.FieldSections ?? []).ToDictionary(section => section.Id);
        var shown = chain
            .SelectMany((owner, depth) => owner.Fields.Select(field => (field, depth)))
            .Where(pair => byField.Contains(pair.field.Id))
            .OrderBy(pair => pair.field.ArchivedAt is not null)
            .ThenBy(pair => pair.depth)
            .ThenBy(pair => pair.field.SectionId is { } id && sections.TryGetValue(id, out var section) ? section.DisplayOrder : -1)
            .ThenBy(pair => pair.field.DisplayOrder)
            .Select(pair => pair.field)
            .ToList();
        if (shown.Count == 0)
        {
            return;
        }

        text.Append("## ").AppendLine(_w.Details).AppendLine();
        Guid? currentSection = null;
        foreach (var field in shown)
        {
            if (field.ArchivedAt is null && field.SectionId != currentSection && field.SectionId is { } sectionId && sections.TryGetValue(sectionId, out var section))
            {
                text.Append("### ").AppendLine(Inline(section.Name)).AppendLine();
            }

            currentSection = field.SectionId;
            var label = field.ArchivedAt is null ? field.Name : $"{field.Name}{_w.ArchivedFieldSuffix}";
            Field(text, label, FieldValue(page, field, byField[field.Id].ToList()), escape: false);
        }
    }

    /// <summary>One field's value as a reader reads it; already escaped, because a reference is a link.</summary>
    private string FieldValue(string page, BackupFieldDefinition field, IReadOnlyList<BackupFieldValue> values) =>
        string.Join(", ", values.Select(value => field.Kind switch
        {
            EntityFieldKind.Number when value.NumberValue is { } number => Year(value.EraId, number),
            EntityFieldKind.Boolean when value.BooleanValue is { } flag => flag ? _w.Yes : _w.No,
            EntityFieldKind.Date when value.DateValue is { } date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            EntityFieldKind.Select or EntityFieldKind.MultiSelect when value.OptionId is { } option =>
                Inline(field.Options.FirstOrDefault(candidate => candidate.Id == option)?.Value ?? string.Empty),
            EntityFieldKind.EntityReference when value.ReferencedEntityId is { } target => EntityLink(page, target),
            _ => MultiLine(value.TextValue),
        }).Where(part => part.Length > 0));

    private void Progression(StringBuilder text, string page, BackupProgression progression)
    {
        var eras = progression.Eras.ToDictionary(era => era.Id, era => era.Name);
        string Eras(IEnumerable<Guid> ids) => string.Join(", ", ids.Where(eras.ContainsKey).Select(id => Inline(eras[id])));
        string Scenes(IEnumerable<Guid> ids) => Links(ids.Select(id => SceneLink(page, id)));

        if (progression.Eras.Count > 0)
        {
            text.Append("## ").AppendLine(_w.Eras).AppendLine();
            foreach (var era in progression.Eras.OrderBy(era => era.SortOrder))
            {
                text.Append("### ").AppendLine(Inline(era.Name)).AppendLine();
                Field(text, _w.When, Join(_w.To, era.Start is { } start ? Point(start) : null, era.End is { } end ? Point(end) : null), escape: false);
                Paragraph(text, era.Description);
                Field(text, _w.Stories, era.StoryIds.Count > 0 ? Links(era.StoryIds.Select(id => StoryLink(page, id))) : null, escape: false);
                Field(text, _w.Scenes, era.SceneIds.Count > 0 ? Scenes(era.SceneIds) : null, escape: false);
                foreach (var value in era.FieldValues.Where(value => _fields.ContainsKey(value.FieldDefinitionId)))
                {
                    var field = _fields[value.FieldDefinitionId];
                    Field(text, field.Name, value.IsCleared
                        ? _w.ClearedInThisEra
                        : FieldValue(page, field, [new BackupFieldValue(value.FieldDefinitionId, value.TextValue, value.NumberValue, value.EraId, value.BooleanValue, value.DateValue, value.OptionId, value.ReferencedEntityId)]), escape: false);
                }
            }
        }

        string? Unlock(Guid? era, Guid? scene, Guid? moment) =>
            Join("; ",
                era is { } e && eras.TryGetValue(e, out var eraName) ? $"{_w.EraPrefix}{Inline(eraName)}" : null,
                scene is { } s ? $"{_w.ScenePrefix}{SceneLink(page, s)}" : null,
                moment is { } m ? $"{_w.MomentPrefix}{MomentName(m)}" : null);

        if (progression.Forms is { Count: > 0 } forms)
        {
            text.Append("## ").AppendLine(_w.Forms).AppendLine();
            foreach (var form in forms.OrderBy(form => form.SortOrder))
            {
                text.Append("### ").AppendLine(Inline(form.Name)).AppendLine();
                Paragraph(text, form.Description);
                Field(text, _w.FirstUnlocked, Unlock(form.UnlockEraId, form.UnlockSceneId, form.UnlockMomentId), escape: false);
                Field(text, _w.AvailableInEras, form.EraIds.Count > 0 ? Eras(form.EraIds) : null, escape: false);
                Field(text, _w.UsedInScenes, form.SceneIds.Count > 0 ? Scenes(form.SceneIds) : null, escape: false);
            }
        }

        if (progression.Abilities is { Count: > 0 } abilities)
        {
            var formNames = (progression.Forms ?? []).ToDictionary(form => form.Id, form => form.Name);
            text.Append("## ").AppendLine(_w.Abilities).AppendLine();
            foreach (var ability in abilities.OrderBy(ability => ability.SortOrder))
            {
                text.Append("### ").AppendLine(Inline(ability.Name)).AppendLine();
                Paragraph(text, ability.Description);
                Field(text, _w.FirstUnlocked, Unlock(ability.UnlockEraId, ability.UnlockSceneId, ability.UnlockMomentId), escape: false);
                Field(text, _w.Forms, ability.FormIds.Count > 0 ? string.Join(", ", ability.FormIds.Where(formNames.ContainsKey).Select(id => Inline(formNames[id]))) : null, escape: false);
                Field(text, _w.AvailableInEras, ability.EraIds.Count > 0 ? Eras(ability.EraIds) : null, escape: false);
                Field(text, _w.UsedInScenes, ability.SceneIds.Count > 0 ? Scenes(ability.SceneIds) : null, escape: false);
            }
        }

        if (progression.Appearances is { Count: > 0 } appearances)
        {
            var formNames = (progression.Forms ?? []).ToDictionary(form => form.Id, form => form.Name);
            text.Append("## ").AppendLine(_w.Appearances).AppendLine();
            foreach (var appearance in appearances.OrderBy(appearance => appearance.SortOrder))
            {
                text.Append("### ").AppendLine(Inline(appearance.Label)).AppendLine();
                Paragraph(text, appearance.Notes);
                Field(text, _w.Eras, appearance.EraIds.Count > 0 ? Eras(appearance.EraIds) : null, escape: false);
                Field(text, _w.Forms, appearance.FormIds.Count > 0 ? string.Join(", ", appearance.FormIds.Where(formNames.ContainsKey).Select(id => Inline(formNames[id]))) : null, escape: false);
                Field(text, _w.Scenes, appearance.SceneIds.Count > 0 ? Scenes(appearance.SceneIds) : null, escape: false);
                foreach (var picture in appearance.Images)
                {
                    text.AppendLine(Image(page, appearance.Label, picture.MediaPath)).AppendLine();
                }
            }
        }
    }

    private void Knowledge(StringBuilder text, string page, Guid entityId)
    {
        var records = _payload.KnowledgeRecords ?? [];
        string Source(BackupKnowledgeRecord record) =>
            record.KnownFromStart ? _w.KnownFromStart : record.SceneId is { } scene ? $"{_w.LearntInPrefix}{SceneLink(page, scene)}" : string.Empty;

        var knows = records.Where(record => record.KnowerEntityId == entityId).ToList();
        var knownBy = records.Where(record => record.SubjectEntityId == entityId && record.KnowerEntityId != entityId).ToList();
        if (knows.Count == 0 && knownBy.Count == 0)
        {
            return;
        }

        text.Append("## ").AppendLine(_w.Knowledge).AppendLine();
        foreach (var record in knows)
        {
            text.Append(_w.KnowsLabel).Append(Inline(record.Statement))
                .Append(record.SubjectEntityId is { } subject && subject != entityId ? $"{_w.AboutPrefix}{EntityLink(page, subject)})" : string.Empty)
                .Append(" - ").AppendLine(Source(record));
        }

        foreach (var record in knownBy)
        {
            text.Append("- ").Append(EntityLink(page, record.KnowerEntityId)).Append(_w.KnowsInfix).Append(Inline(record.Statement))
                .Append(" - ").AppendLine(Source(record));
        }

        text.AppendLine();
    }

    private string Relationships()
    {
        var text = new StringBuilder($"# {_w.Relationships}\n\n");
        var rows = LiveRelationships().ToList();
        if (rows.Count == 0)
        {
            return text.AppendLine(_w.None).ToString();
        }

        text.AppendLine(_w.RelationshipTableHeader).AppendLine("| --- | --- | --- | --- | --- | --- |");
        foreach (var relationship in rows
                     .OrderBy(row => EntityName(row.SourceEntityId), StringComparer.Ordinal)
                     .ThenBy(row => _relationshipTypes[row.RelationshipTypeId].Name, StringComparer.Ordinal)
                     .ThenBy(row => row.Id))
        {
            var when = new StringBuilder();
            AppendPeriods(when, relationship);
            text.Append("| ").Append(EntityLink(RelationshipsPage, relationship.SourceEntityId))
                .Append(" | ").Append(Inline(_relationshipTypes[relationship.RelationshipTypeId].Name))
                .Append(" | ").Append(EntityLink(RelationshipsPage, relationship.TargetEntityId))
                .Append(" | ").Append(_w.StatusOf(relationship.CanonStatus))
                .Append(" | ").Append(when.ToString().TrimStart(' ', '-'))
                .Append(" | ").Append(Inline(relationship.Notes))
                .AppendLine(" |");
        }

        if (_payload.RelationshipTypes.Count > 0)
        {
            text.AppendLine().Append("## ").AppendLine(_w.Kinds).AppendLine();
            foreach (var kind in _payload.RelationshipTypes.OrderBy(kind => kind.DisplayOrder))
            {
                text.Append("- **").Append(Inline(kind.Name)).Append("**")
                    .Append(kind.IsSymmetric ? _w.BothWays : kind.InverseName is { Length: > 0 } inverse ? $" / {Inline(inverse)}" : string.Empty)
                    .AppendLine(kind.Description is { Length: > 0 } description ? $" - {Inline(description)}" : string.Empty);
            }
        }

        return text.ToString();
    }

    private string TimelineReadme()
    {
        var text = new StringBuilder($"# {_w.Timeline}\n\n");

        if (_payload.ChronologyEras is { Count: > 0 } eras)
        {
            text.Append("## ").AppendLine(_w.DatePeriods).AppendLine();
            foreach (var era in eras.OrderBy(era => era.SortOrder))
            {
                text.Append("- **").Append(Inline(era.Name)).Append("**")
                    .Append(era.Abbreviation is { Length: > 0 } abbreviation ? $" ({Inline(abbreviation)})" : string.Empty)
                    .AppendLine(era.Direction == ChronologyEraDirection.Descending ? _w.YearsCountDown : string.Empty);
            }

            text.AppendLine();
        }

        if (_payload.ChronologyCalendar is { Months.Count: > 0 } calendar)
        {
            text.Append("## ").AppendLine(_w.Calendar).AppendLine();
            foreach (var month in calendar.Months.OrderBy(month => month.SortOrder))
            {
                text.Append(month.SortOrder + 1).Append(". ").Append(Inline(month.Name)).Append(" - ").Append(month.DayCount).AppendLine(_w.Days);
            }

            text.AppendLine();
        }

        text.Append("## ").AppendLine(_w.Moments).AppendLine();
        if (_moments.Count == 0)
        {
            text.AppendLine(_w.None);
        }

        foreach (var moment in _moments.Values.OrderBy(MomentOrder))
        {
            text.Append("### ").AppendLine(Inline(moment.Title)).AppendLine();
            text.Append(Moment(moment)).Append(" - ").AppendLine(_w.StatusOf(moment.CanonStatus)).AppendLine();
            Paragraph(text, moment.Description);
            Field(text, _w.Who, moment.ParticipantEntityIds.Count > 0 ? Links(moment.ParticipantEntityIds.Select(id => EntityLink(TimelinePage, id))) : null, escape: false);
            Field(text, _w.Stories, moment.StoryIds is { Count: > 0 } stories ? Links(stories.Select(id => StoryLink(TimelinePage, id))) : null, escape: false);
            if (moment.Validation is { } details)
            {
                Field(text, _w.Details, Join(", ",
                    details.EventKindTermId is { } kind && _terms.TryGetValue(kind, out var kindName) ? $"{_w.EventPrefix}{Inline(kindName)}" : null,
                    details.MethodTermId is { } method && _terms.TryGetValue(method, out var methodName) ? $"{_w.MethodPrefix}{Inline(methodName)}" : null,
                    details.ParticipantEntityId is { } who ? $"{_w.ParticipantPrefix}{EntityLink(TimelinePage, who)}" : null), escape: false);
            }
        }

        return text.ToString();
    }

    private string StoryPage(BackupStory story)
    {
        var page = _storyPaths[story.Id];
        var text = new StringBuilder();
        text.Append("# ").AppendLine(Inline(story.Title)).AppendLine();
        text.Append('*').Append(_w.StatusOf(story.Status)).AppendLine("*").AppendLine();
        Paragraph(text, story.Premise);
        Field(text, _w.PublicSummary, story.PublicSummary);

        var scenes = LiveScenes(story).ToList();
        var chapters = (story.Chapters ?? []).Where(chapter => chapter.DeletedAt is null).OrderBy(chapter => chapter.SortOrder).ToList();
        void SceneList(IEnumerable<BackupScene> list)
        {
            foreach (var scene in list)
            {
                text.Append("1. ").AppendLine(SceneLink(page, scene.Id));
            }

            text.AppendLine();
        }

        text.Append("## ").AppendLine(_w.Scenes).AppendLine();
        if (scenes.Count == 0)
        {
            text.AppendLine(_w.None).AppendLine();
        }

        var unchaptered = scenes.Where(scene => scene.ChapterId is null).ToList();
        if (unchaptered.Count > 0)
        {
            if (chapters.Count > 0)
            {
                text.Append("### ").AppendLine(_w.Unchaptered).AppendLine();
            }

            SceneList(unchaptered);
        }

        // Chapters in no arc first, then each arc with its own (ADR 0070); a chapter's number restarts in each.
        var arcs = LiveArcs(story);
        var numbers = ChapterNumbers(story);

        void ChapterList(IEnumerable<BackupChapter> list, string heading)
        {
            foreach (var chapter in list)
            {
                text.Append(heading).Append(_w.ChapterWord).Append(numbers[chapter.Id]).Append(": ").AppendLine(Inline(chapter.Title)).AppendLine();
                Paragraph(text, chapter.Summary);
                Field(text, _w.Notes, chapter.Notes);
                SceneList(scenes.Where(scene => scene.ChapterId == chapter.Id));
            }
        }

        ChapterList(chapters.Where(chapter => ArcOf(story, chapter) is null), "###");

        foreach (var arc in arcs)
        {
            text.Append(_w.ArcHeading).Append(arc.SortOrder + 1).Append(": ").AppendLine(Inline(arc.Title)).AppendLine();
            Paragraph(text, arc.Description);
            Field(text, _w.Notes, arc.Notes);
            ChapterList(chapters.Where(chapter => ArcOf(story, chapter) == arc.Id), "####");
        }

        return text.ToString();
    }

    private static List<BackupPlotArc> LiveArcs(BackupStory story) =>
        [.. (story.PlotArcs ?? []).Where(arc => arc.DeletedAt is null).OrderBy(arc => arc.SortOrder)];

    /// <summary>The live arc a chapter is told in, or null: a chapter whose arc is in the Trash reads as in none.</summary>
    private static Guid? ArcOf(BackupStory story, BackupChapter chapter) =>
        chapter.PlotArcId is { } arcId && LiveArcs(story).Any(arc => arc.Id == arcId) ? arcId : null;

    /// <summary>Each live chapter's number as the workspace shows it: from 1 inside its arc, or among those in none.</summary>
    private static Dictionary<Guid, int> ChapterNumbers(BackupStory story)
    {
        var numbers = new Dictionary<Guid, int>();
        foreach (var group in (story.Chapters ?? []).Where(chapter => chapter.DeletedAt is null).OrderBy(chapter => chapter.SortOrder).GroupBy(chapter => ArcOf(story, chapter)))
        {
            var number = 0;
            foreach (var chapter in group)
            {
                numbers[chapter.Id] = ++number;
            }
        }

        return numbers;
    }

    private string ScenePage(BackupStory story, BackupScene scene)
    {
        var page = _scenePaths[scene.Id];
        var text = new StringBuilder();
        text.Append("# ").AppendLine(Inline(scene.Title)).AppendLine();
        var chapter = (story.Chapters ?? []).FirstOrDefault(candidate => candidate.Id == scene.ChapterId && candidate.DeletedAt is null);
        text.Append(_w.InPrefix).Append(Link(story.Title, Relative(page, _storyPaths[story.Id])))
            .AppendLine(chapter is null ? "." : $"{_w.ChapterInfix}{ChapterNumbers(story)[chapter.Id]}: {Inline(chapter.Title)}.").AppendLine();

        Field(text, _w.PointOfView, scene.PovEntityId is { } pov ? EntityLink(page, pov) : null, escape: false);
        Field(text, _w.When, scene.Chronology is { } when ? Point(when) : null, escape: false);
        Field(text, _w.Lore, scene.LinkedEntityIds.Count > 0 ? Links(scene.LinkedEntityIds.Select(id => EntityLink(page, id))) : null, escape: false);
        Paragraph(text, scene.Summary);
        Field(text, _w.Notes, scene.Notes);

        var beats = (scene.Beats ?? []).OrderBy(beat => beat.SortOrder).ToList();
        if (beats.Count > 0)
        {
            text.Append("## ").AppendLine(_w.Beats).AppendLine();
            foreach (var beat in beats)
            {
                text.Append("1. ").Append(Inline(beat.Title))
                    .AppendLine(beat.Note is { Length: > 0 } note ? $" - {Inline(note)}" : string.Empty);
            }

            text.AppendLine();
        }

        if (scene.Manuscript is { Content.Length: > 0 } manuscript)
        {
            text.Append("## ").AppendLine(_w.Manuscript).AppendLine().AppendLine(Manuscript(page, manuscript.Content));
        }

        return text.ToString();
    }

    private string MapPage(BackupMap map)
    {
        var page = _mapPaths[map.Id];
        var text = new StringBuilder();
        text.Append("# ").AppendLine(Inline(map.Name)).AppendLine();
        Paragraph(text, map.Description);
        text.AppendLine(Image(page, map.Name, map.Image.MediaPath)).AppendLine();
        Field(text, _w.Size, $"{map.Image.Width} x {map.Image.Height}{_w.PixelsSuffix}");
        if (map.Calibration is { } scale)
        {
            Field(text, _w.Scale, $"{scale.Distance.ToString("0.####", CultureInfo.InvariantCulture)} {scale.Unit}{_w.BetweenWord}({Percent(scale.X1)}, {Percent(scale.Y1)}){_w.AndWord}({Percent(scale.X2)}, {Percent(scale.Y2)})");
        }

        text.Append("## ").AppendLine(_w.Pins).AppendLine();
        if (map.Pins.Count == 0)
        {
            return text.AppendLine(_w.None).ToString();
        }

        text.AppendLine(_w.PinTableHeader).AppendLine("| --- | --- | --- | --- | --- |");
        foreach (var pin in map.Pins)
        {
            text.Append("| ").Append(Inline(pin.Title))
                .Append(pin.PlacedOnCurrentImage ? string.Empty : _w.PlacedOnEarlierPicture)
                .Append(" | ").Append(pin.EntityId is { } entity ? EntityLink(page, entity) : string.Empty)
                .Append(" | ").Append(Percent(pin.X)).Append(" | ").Append(Percent(pin.Y))
                .Append(" | ").Append(Inline(pin.Note)).AppendLine(" |");
        }

        return text.ToString();
    }

    private string WorldRules()
    {
        var text = new StringBuilder($"# {_w.WorldRules}\n\n");
        var rules = LiveRules().ToList();
        if (rules.Count == 0)
        {
            return text.AppendLine(_w.None).ToString();
        }

        foreach (var rule in rules)
        {
            text.Append("## ").AppendLine(Inline(rule.Title)).AppendLine();
            Paragraph(text, rule.Description);
            if (rule.Validation is { } check)
            {
                Field(text, _w.Check, string.Format(
                    CultureInfo.InvariantCulture,
                    _w.CheckSentence,
                    check.MaxOccurrences,
                    _terms.GetValueOrDefault(check.EventKindTermId, "?"),
                    _terms.GetValueOrDefault(check.MethodTermId, "?")));
            }
        }

        return text.ToString();
    }

    private string Ideas()
    {
        var text = new StringBuilder($"# {_w.Ideas}\n\n{_w.IdeasIntro}\n\n");
        var ideas = LiveIdeas().ToList();
        if (ideas.Count == 0)
        {
            return text.AppendLine(_w.None).ToString();
        }

        foreach (var idea in ideas)
        {
            text.Append("## ").AppendLine(Inline(idea.Title)).AppendLine();
            Paragraph(text, idea.Body);
            Field(text, _w.About, idea.References.Count > 0 ? Links(idea.References.Select(reference => reference.Kind switch
            {
                IdeaReferenceKind.Entity => EntityLink(IdeasPage, reference.Id),
                IdeaReferenceKind.Story => StoryLink(IdeasPage, reference.Id),
                IdeaReferenceKind.Scene => SceneLink(IdeasPage, reference.Id),
                _ => StoryOfArc(reference.Id) is { } story ? StoryLink(IdeasPage, story) : _w.ArcInTrash,
            }).Distinct(StringComparer.Ordinal)) : null, escape: false);
        }

        return text.ToString();
    }

    private Guid? StoryOfArc(Guid id) => LiveStories()
        .FirstOrDefault(story => (story.PlotArcs ?? []).Any(arc => arc.Id == id))?.Id;

    private IEnumerable<BackupRelationship> LiveRelationships() => _payload.Relationships.Where(relationship =>
        relationship.DeletedAt is null && _entities.ContainsKey(relationship.SourceEntityId) && _entities.ContainsKey(relationship.TargetEntityId));

    private IEnumerable<BackupWorldRule> LiveRules() => (_payload.WorldRules ?? []).Where(rule => rule.DeletedAt is null);

    private IEnumerable<BackupIdea> LiveIdeas() => (_payload.Ideas ?? []).Where(idea => idea.DeletedAt is null);

    private string EntityName(Guid id) => _entities.TryGetValue(id, out var entity) ? entity.Name : string.Empty;

    // ---------- Dates ----------

    /// <summary>
    /// A year as the author reads it: the same rule as <see cref="UniverseChronology.FormatYear"/>. Every date helper below
    /// answers Markdown with the author's labels already escaped, so a caller appends it as it is.
    /// </summary>
    private string Year(Guid? eraId, double year)
    {
        var number = year.ToString("0.####", CultureInfo.InvariantCulture);
        if (eraId is not { } id || !_eras.TryGetValue(id, out var era))
        {
            return number;
        }

        var label = Inline(era.Abbreviation ?? era.Name);
        return era.LabelPosition == ChronologyLabelPosition.AfterYear ? $"{number} {label}" : $"{label} {number}";
    }

    private string Date(int? year, int? month, int? day, Guid? eraId, Guid? monthId, string? plainLabel)
    {
        if (year is not { } y)
        {
            return _w.DateUnknown;
        }

        var written = Year(eraId, y);
        if (eraId is null && plainLabel is { Length: > 0 })
        {
            written = $"{written} {Inline(plainLabel)}";
        }

        var monthName = monthId is { } id && _months.TryGetValue(id, out var named) ? Inline(named.Name) : month is { } number ? $"{_w.MonthPrefix}{number}" : null;
        return Join(", ", written, monthName, day is { } d ? $"{_w.DayPrefix}{d}" : null)!;
    }

    private string Point(BackupChronologyValue point) => Date(point.Year, point.Month, point.Day, point.EraId, point.MonthId, null);

    private string Moment(BackupTimelineEntry moment)
    {
        var start = Date(moment.StartYear, moment.StartMonth, moment.StartDay, moment.StartEraId, moment.StartMonthId, moment.EraLabel);
        return moment.DateKind switch
        {
            TimelineDateKind.Unknown => _w.DateUnknown,
            TimelineDateKind.Approximate => $"{_w.AroundPrefix}{start}",
            TimelineDateKind.Range => $"{start}{_w.To}{Date(moment.EndYear, moment.EndMonth, moment.EndDay, moment.EndEraId, moment.EndMonthId, moment.EraLabel)}",
            _ => start,
        };
    }

    /// <summary>Era rank, then the year in the era's direction, then month and day; undated moments last.</summary>
    private (int, int, double, int, int, string) MomentOrder(BackupTimelineEntry moment)
    {
        if (moment.DateKind == TimelineDateKind.Unknown || moment.StartYear is not { } year)
        {
            return (1, 0, 0, 0, 0, moment.Title);
        }

        var era = moment.StartEraId is { } id && _eras.TryGetValue(id, out var found) ? found : null;
        var signed = era?.Direction == ChronologyEraDirection.Descending ? -year : year;
        var month = moment.StartMonthId is { } monthId && _months.TryGetValue(monthId, out var named) ? named.SortOrder + 1 : moment.StartMonth ?? 0;
        return (0, era?.SortOrder ?? 0, signed, month, moment.StartDay ?? 0, moment.Title);
    }

    private void AppendPeriods(StringBuilder text, BackupRelationship relationship)
    {
        foreach (var period in relationship.Periods ?? [])
        {
            text.Append(" - ").Append(period.EntityEraId is { } era && _entityEras.TryGetValue(era, out var named)
                ? $"{_w.DuringPrefix}{Inline(named.Name)}"
                : Join(_w.To, period.Start is { } start ? Point(start) : "?", period.End is { } end ? Point(end) : "?"));
        }
    }

    private static string Percent(double fraction) => (fraction * 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";

    // ---------- Text ----------

    /// <summary>One line of the author's text, safe inside a heading, a list, a table cell or a link's words.</summary>
    internal static string Inline(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var text = new StringBuilder(value.Length + 8);
        foreach (var character in value)
        {
            if (character is '\r' or '\n')
            {
                text.Append(' ');
                continue;
            }

            if (character is '\\' or '`' or '*' or '_' or '[' or ']' or '<' or '>' or '#' or '|')
            {
                text.Append('\\');
            }

            text.Append(character);
        }

        return text.ToString();
    }

    /// <summary>Several lines of the author's text: each escaped, and a line break kept as one.</summary>
    private static string MultiLine(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : string.Join("  \n", value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n').Select(Inline));

    private static void Paragraph(StringBuilder text, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            text.AppendLine(MultiLine(value)).AppendLine();
        }
    }

    private static void Field(StringBuilder text, string label, string? value, bool escape = true)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            text.Append("**").Append(Inline(label)).Append(":** ").AppendLine(escape ? MultiLine(value) : value).AppendLine();
        }
    }

    private static string? Join(string separator, params string?[] parts)
    {
        var present = parts.Where(part => !string.IsNullOrWhiteSpace(part)).ToList();
        return present.Count == 0 ? null : string.Join(separator, present);
    }


    /// <summary>
    /// A scene's prose as written - every line as it is, so the words stay the author's - with each mention a link to the
    /// entry it names (its name alone when that entry is not exported). <c>\</c>, <c>[</c>, <c>]</c>, <c>&lt;</c> and
    /// <c>&gt;</c> are escaped, so prose a collaborator wrote can never become a link, an image or HTML in a viewer.
    /// </summary>
    private string Manuscript(string page, string content)
    {
        var text = new StringBuilder(content.Length + 64);
        var at = 0;
        foreach (var mention in ManuscriptMentions.Find(content))
        {
            text.Append(EscapeProse(content[at..mention.Start]));
            text.Append(_entities.ContainsKey(mention.EntityId) ? Link(mention.Name, Relative(page, _entityPaths[mention.EntityId])) : Inline(mention.Name));
            at = mention.Start + mention.Length;
        }

        return text.Append(EscapeProse(content[at..])).ToString();
    }

    private static string EscapeProse(string value)
    {
        var text = new StringBuilder(value.Length + 8);
        foreach (var character in value)
        {
            if (character is '\\' or '[' or ']' or '<' or '>')
            {
                text.Append('\\');
            }

            text.Append(character);
        }

        return text.ToString();
    }

    // ---------- Articles ----------

    /// <summary>
    /// An article's Tiptap document as Markdown: paragraphs, headings (two levels down, under the page's own), lists, quotes,
    /// code, rules, breaks, bold, italic, strike, code and links - only <c>http</c>, <c>https</c> and <c>mailto</c> links, as
    /// the editor allows. An unknown node keeps its text. Unreadable content renders nothing; the backup still holds it.
    /// </summary>
    internal static string Article(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(content);
            var lines = new List<string>();
            Blocks(document.RootElement, lines, 0);
            return string.Join('\n', lines).Trim('\n');
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    private static IEnumerable<JsonElement> Children(JsonElement node) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty("content", out var children) && children.ValueKind == JsonValueKind.Array
            ? children.EnumerateArray()
            : [];

    private static string TypeOf(JsonElement node) =>
        node.ValueKind == JsonValueKind.Object && node.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String
            ? type.GetString() ?? string.Empty
            : string.Empty;

    private static void Blocks(JsonElement node, List<string> lines, int depth)
    {
        if (depth > 40)
        {
            return;
        }

        foreach (var child in Children(node))
        {
            Block(child, lines, depth + 1);
        }
    }

    private static void Block(JsonElement node, List<string> lines, int depth)
    {
        switch (TypeOf(node))
        {
            case "paragraph":
                lines.Add(LeadEscaped(Inlines(node)));
                lines.Add(string.Empty);
                break;
            case "heading":
                var level = node.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object
                    && attrs.TryGetProperty("level", out var levelValue) && levelValue.TryGetInt32(out var parsed) ? parsed : 1;
                lines.Add($"{new string('#', Math.Clamp(level + 2, 3, 6))} {Inlines(node)}");
                lines.Add(string.Empty);
                break;
            case "bulletList":
            case "orderedList":
                var ordered = TypeOf(node) == "orderedList";
                var number = ordered && node.TryGetProperty("attrs", out var listAttrs) && listAttrs.ValueKind == JsonValueKind.Object
                    && listAttrs.TryGetProperty("start", out var start) && start.TryGetInt32(out var first) ? first : 1;
                foreach (var item in Children(node))
                {
                    var itemLines = new List<string>();
                    Blocks(item, itemLines, depth + 1);
                    var marker = ordered ? $"{number++}. " : "- ";
                    var body = itemLines.Where((line, index) => !(line.Length == 0 && index == itemLines.Count - 1)).ToList();
                    for (var index = 0; index < body.Count; index++)
                    {
                        lines.Add(index == 0 ? marker + body[index] : (body[index].Length == 0 ? string.Empty : new string(' ', marker.Length) + body[index]));
                    }
                }

                lines.Add(string.Empty);
                break;
            case "blockquote":
                var quoted = new List<string>();
                Blocks(node, quoted, depth + 1);
                lines.AddRange(quoted.Select(line => line.Length == 0 ? ">" : $"> {line}"));
                lines.Add(string.Empty);
                break;
            case "codeBlock":
                lines.Add("```");
                lines.AddRange(PlainText(node).Replace("```", "` ` `", StringComparison.Ordinal).Split('\n'));
                lines.Add("```");
                lines.Add(string.Empty);
                break;
            case "horizontalRule":
                lines.Add("---");
                lines.Add(string.Empty);
                break;
            default:
                if (Children(node).Any(child => TypeOf(child) is "text" or "hardBreak"))
                {
                    lines.Add(LeadEscaped(Inlines(node)));
                    lines.Add(string.Empty);
                }
                else
                {
                    Blocks(node, lines, depth + 1);
                }

                break;
        }
    }

    /// <summary>A paragraph that starts like a list, a quote or a numbered item stays a paragraph.</summary>
    private static string LeadEscaped(string line)
    {
        if (line.Length > 0 && line[0] is '-' or '+' or '=')
        {
            return "\\" + line;
        }

        var digits = 0;
        while (digits < line.Length && char.IsAsciiDigit(line[digits]))
        {
            digits++;
        }

        return digits > 0 && digits < line.Length && line[digits] is '.' or ')' ? line[..digits] + "\\" + line[digits..] : line;
    }

    private static string PlainText(JsonElement node)
    {
        var text = new StringBuilder();
        foreach (var child in Children(node))
        {
            text.Append(TypeOf(child) == "text" && child.TryGetProperty("text", out var value) ? value.GetString() : PlainText(child));
        }

        return text.ToString();
    }

    private static string Inlines(JsonElement node)
    {
        var text = new StringBuilder();
        foreach (var child in Children(node))
        {
            switch (TypeOf(child))
            {
                case "text" when child.TryGetProperty("text", out var value) && value.ValueKind == JsonValueKind.String:
                    text.Append(Marked(Inline(value.GetString()), child));
                    break;
                case "hardBreak":
                    text.Append("\\\n");
                    break;
                default:
                    text.Append(Inlines(child));
                    break;
            }
        }

        return text.ToString();
    }

    private static string Marked(string text, JsonElement node)
    {
        if (text.Length == 0 || !node.TryGetProperty("marks", out var marks) || marks.ValueKind != JsonValueKind.Array)
        {
            return text;
        }

        string? href = null;
        foreach (var mark in marks.EnumerateArray())
        {
            switch (TypeOf(mark))
            {
                case "bold":
                    text = $"**{text}**";
                    break;
                case "italic":
                    text = $"*{text}*";
                    break;
                case "strike":
                    text = $"~~{text}~~";
                    break;
                case "code":
                    text = $"`{text}`";
                    break;
                case "link" when mark.TryGetProperty("attrs", out var attrs) && attrs.ValueKind == JsonValueKind.Object
                                 && attrs.TryGetProperty("href", out var target) && target.ValueKind == JsonValueKind.String:
                    href = SafeHref(target.GetString());
                    break;
            }
        }

        return href is null ? text : $"[{text}]({href})";
    }

    /// <summary>The editor's own rule (<see cref="LoreContent"/>): http, https and mailto only. Anything else is dropped.</summary>
    private static string? SafeHref(string? href)
    {
        if (href is null || !Uri.TryCreate(href.Trim(), UriKind.Absolute, out var uri)
            || !AllowedLinkSchemes.Contains(uri.Scheme, StringComparer.OrdinalIgnoreCase))
        {
            return null;
        }

        return uri.AbsoluteUri.Replace("(", "%28", StringComparison.Ordinal).Replace(")", "%29", StringComparison.Ordinal)
            .Replace(" ", "%20", StringComparison.Ordinal).Replace("<", "%3C", StringComparison.Ordinal).Replace(">", "%3E", StringComparison.Ordinal);
    }
}
