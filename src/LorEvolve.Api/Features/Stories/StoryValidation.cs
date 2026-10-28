using System.Globalization;
using LorEvolve.Api.Features.Chronology;

namespace LorEvolve.Api.Features.Stories;

/// <summary>
/// Input checks for stories and scenes. Structural only: a story makes no claim about the world, so
/// nothing here compares a scene with the lore, with the timeline or with another scene. In
/// particular a scene placed earlier in the world than the scene told before it is not an error -
/// nonlinear stories are valid.
/// </summary>
public static class StoryValidation
{
    /// <summary>A scene's chronology errors are reported under its request member: "chronology.year".</summary>
    public static readonly ChronologyPointKeys ChronologyKeys = ChronologyPointKeys.Nested("chronology");

    public static Dictionary<string, string[]>? ValidateStory(StoryRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the story a title.", errors);

        if (request.Premise?.Trim() is { Length: > StoryLimits.PremiseMaxLength })
        {
            errors["premise"] = [$"Keep the premise under {StoryLimits.PremiseMaxLength} characters."];
        }

        if (!Enum.IsDefined(request.Status))
        {
            errors["status"] = ["That is not a story status LorEvolve knows."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>A chapter is plain planning text: a title it needs, and a summary and notes it may have.</summary>
    public static Dictionary<string, string[]>? ValidateChapter(ChapterRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the chapter a title, like \"Arrival\".", errors);

        if (request.Summary?.Trim() is { Length: > StoryLimits.ChapterSummaryMaxLength })
        {
            errors["summary"] = [$"Keep the summary under {StoryLimits.ChapterSummaryMaxLength} characters."];
        }

        if (request.Notes?.Trim() is { Length: > StoryLimits.ChapterNotesMaxLength })
        {
            errors["notes"] = [$"Keep the notes under {StoryLimits.ChapterNotesMaxLength} characters."];
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>An arc is plain planning text: a title it needs, and a description and notes it may have.</summary>
    public static Dictionary<string, string[]>? ValidatePlotArc(PlotArcRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the arc a title, like \"Fall of the King\".", errors);
        ValidatePlotText(request.Description, request.Notes, errors);

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// A beat's text and how many links it carries. Structural only: nothing compares a beat's order with its
    /// scenes' order, their chapters or their chronology, and nothing reads its title for meaning.
    /// </summary>
    public static Dictionary<string, string[]>? ValidatePlotBeat(PlotBeatRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the beat a title, like \"The capital is breached\".", errors);
        ValidatePlotText(request.Description, request.Notes, errors);

        if (request.SceneIds is { Count: > StoryLimits.MaxLinkedScenes })
        {
            errors["sceneIds"] = [$"Link at most {StoryLimits.MaxLinkedScenes} scenes to one beat."];
        }

        if (request.EntityIds is { Count: > StoryLimits.MaxLinkedEntities })
        {
            errors["entityIds"] = [$"Link at most {StoryLimits.MaxLinkedEntities} entries to one beat."];
        }

        return errors.Count == 0 ? null : errors;
    }

    public static Dictionary<string, string[]>? ValidateScene(
        SceneRequest request,
        UniverseChronology chronology)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateTitle(request.Title, "Give the scene a title, like \"The Council\".", errors);

        if (request.Summary?.Trim() is { Length: > StoryLimits.SceneSummaryMaxLength })
        {
            errors["summary"] = [$"Keep the summary under {StoryLimits.SceneSummaryMaxLength} characters."];
        }

        if (request.Notes?.Trim() is { Length: > StoryLimits.SceneNotesMaxLength })
        {
            errors["notes"] = [$"Keep the notes under {StoryLimits.SceneNotesMaxLength} characters."];
        }

        if (request.EntityIds is { Count: > StoryLimits.MaxLinkedEntities })
        {
            errors["entityIds"] = [$"Link at most {StoryLimits.MaxLinkedEntities} entries to one scene."];
        }

        if (request.Chronology is { } point)
        {
            ChronologyPointValidation.ValidatePoint(point, ChronologyKeys, chronology, errors);
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// A manuscript save: the text must be sent, and fit the per-scene bound. Nothing else is checked. The text is never
    /// trimmed, normalised or read for meaning, and an empty string is a valid manuscript.
    /// </summary>
    public static Dictionary<string, string[]>? ValidateManuscript(SceneManuscriptRequest request)
    {
        if (request.Content is null)
        {
            return new Dictionary<string, string[]> { ["content"] = ["Send the manuscript text, even when it is empty."] };
        }

        if (request.Content.Length > StoryLimits.ManuscriptMaxLength)
        {
            var limit = StoryLimits.ManuscriptMaxLength.ToString("N0", CultureInfo.InvariantCulture);
            return new Dictionary<string, string[]>
            {
                ["content"] = [$"Keep one scene's manuscript under {limit} characters. Split it into more scenes."],
            };
        }

        return null;
    }

    private static void ValidateTitle(string? value, string missing, Dictionary<string, string[]> errors)
    {
        var title = value?.Trim();

        if (string.IsNullOrWhiteSpace(title))
        {
            errors["title"] = [missing];
        }
        else if (title.Length > StoryLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {StoryLimits.TitleMaxLength} characters."];
        }
    }

    private static void ValidatePlotText(string? description, string? notes, Dictionary<string, string[]> errors)
    {
        if (description?.Trim() is { Length: > StoryLimits.PlotDescriptionMaxLength })
        {
            errors["description"] = [$"Keep the description under {StoryLimits.PlotDescriptionMaxLength} characters."];
        }

        if (notes?.Trim() is { Length: > StoryLimits.PlotNotesMaxLength })
        {
            errors["notes"] = [$"Keep the notes under {StoryLimits.PlotNotesMaxLength} characters."];
        }
    }

    public static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
