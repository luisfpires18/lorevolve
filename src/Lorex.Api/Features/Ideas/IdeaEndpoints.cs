using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Ideas;

/// <summary>
/// An account's ideas: possibilities kept apart from the lore (ADR 0030).
///
/// <b>Account-scoped, first and always.</b> Every route starts from the signed-in account and finds an idea only by its id
/// and that account together, so another account's idea - assigned to a universe or not - answers exactly as a missing one
/// does. A universe association is checked against the same account and is never what grants access.
///
/// <b>Nothing here touches lore.</b> No route passes the Canon promotion gate, reconciles Canon Integrity, reindexes search
/// or writes an entry, relationship, moment, story or revision. A reference points at a target and changes nothing in it.
///
/// <b>No silent overwrite.</b> A save names the <c>updatedAt</c> it was written over; when the idea has moved on since - saved
/// from another tab or device, or released from a deleted universe - it is refused with 409 <c>idea_changed</c> and nothing
/// is written. A save that would change nothing writes nothing.
///
/// <b>Deleted, not destroyed.</b> Deleting marks the idea; it leaves every list but the deleted one, keeps its association and
/// references, and a restore clears the mark. A deleted idea answers every other route as a missing one does.
/// </summary>
public static class IdeaEndpoints
{
    /// <summary>The machine-readable marker on the 409 for a save written over an idea that has since changed.</summary>
    public const string ChangedCode = "idea_changed";

    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 50;

    public static IEndpointRouteBuilder MapIdeaEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/ideas")
            .WithTags("Ideas")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListIdeas");
        group.MapPost("/", CreateAsync).WithName("CreateIdea");
        group.MapGet("/reference-targets", ListTargetsAsync).WithName("ListIdeaReferenceTargets");
        group.MapGet("/{id:guid}", GetAsync).WithName("GetIdea");
        group.MapPut("/{id:guid}", UpdateAsync).WithName("UpdateIdea");
        group.MapDelete("/{id:guid}", DeleteAsync).WithName("DeleteIdea");
        group.MapPost("/{id:guid}/restore", RestoreAsync).WithName("RestoreIdea");

        return endpoints;
    }

    /// <summary>
    /// A page of the account's ideas: live ones most recently updated first, or with <paramref name="deleted"/> the deleted
    /// ones most recently deleted first. <paramref name="universeId"/> narrows to one universe's ideas and
    /// <paramref name="unassigned"/> to those in none; asking for both is refused. <paramref name="search"/> matches the title
    /// or the body. A row carries the start of the body, never all of it.
    ///
    /// <paramref name="storyId"/> narrows a universe's ideas further, to those with an explicit reference to the story itself
    /// or to one of its scenes, arcs or beats - a projection of the references, never a column on the idea, and never read
    /// from a title or a body. It needs <paramref name="universeId"/>, and a story that is not live in one of the caller's
    /// universes answers 404, exactly as a missing one does. One idea is one row however many of the story's parts it names.
    /// </summary>
    private static async Task<IResult> ListAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] Guid? universeId = null,
        [FromQuery] Guid? storyId = null,
        [FromQuery] bool unassigned = false,
        [FromQuery] bool deleted = false,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize)
    {
        var ownerId = principal.RequireUserId();

        if (universeId is not null && unassigned)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["unassigned"] = ["Ask for one universe's ideas or for unassigned ones, not both."],
            });
        }

        if (storyId is not null && universeId is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["storyId"] = ["Ask for a story's ideas together with its universe."],
            });
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        // Owner-only, like the ideas themselves: a collaborator's role in the universe never opens this.
        if (storyId is { } story
            && !await db.Stories.AnyAsync(
                candidate => candidate.Id == story
                    && candidate.UniverseId == universeId
                    && candidate.DeletedAt == null
                    && candidate.Universe!.OwnerId == ownerId,
                cancellationToken))
        {
            return Results.NotFound();
        }

        var query = db.Ideas.AsNoTracking().Where(idea => idea.OwnerId == ownerId);

        query = deleted ? query.Where(idea => idea.DeletedAt != null) : query.Where(idea => idea.DeletedAt == null);

        if (universeId is { } onlyUniverse)
        {
            query = query.Where(idea => idea.UniverseId == onlyUniverse);

            // EXISTS per reference kind, so an idea naming the story, a scene and a beat of it is still one row, and the
            // narrowing happens before the count and the page. A reference to a part since put in the Trash still counts:
            // it is still on the idea, and still in this story.
            if (storyId is { } onlyStory)
            {
                query = query.Where(idea =>
                    idea.StoryReferences.Any(reference => reference.StoryId == onlyStory)
                    || idea.SceneReferences.Any(reference => reference.Scene!.StoryId == onlyStory)
                    || idea.PlotArcReferences.Any(reference => reference.PlotArc!.StoryId == onlyStory)
                    || idea.PlotBeatReferences.Any(reference => reference.PlotBeat!.PlotArc!.StoryId == onlyStory));
            }
        }
        else if (unassigned)
        {
            query = query.Where(idea => idea.UniverseId == null);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            query = query.Where(idea =>
                EF.Functions.Like(idea.Title, pattern, "\\") || EF.Functions.Like(idea.Body, pattern, "\\"));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);

        var ordered = deleted
            ? query.OrderByDescending(idea => idea.DeletedAt).ThenBy(idea => idea.Id)
            : query.OrderByDescending(idea => idea.UpdatedAt).ThenBy(idea => idea.Id);

        var rows = await ordered
            .Skip(skip)
            .Take(pageSize)
            .Select(idea => new
            {
                idea.Id,
                idea.Title,
                // SQLite counts characters here, never half of one, so a shortened body cannot end mid-character.
                Excerpt = idea.Body.Substring(0, IdeaLimits.ExcerptLength),
                IsShortened = idea.Body.Length > IdeaLimits.ExcerptLength,
                Universe = idea.UniverseId == null
                    ? null
                    : new IdeaUniverse(
                        idea.Universe!.Id,
                        idea.Universe.Name,
                        idea.Universe.AccentColor,
                        idea.Universe.IsArchived),
                ReferenceCount = idea.EntityReferences.Count
                    + idea.StoryReferences.Count
                    + idea.SceneReferences.Count
                    + idea.PlotArcReferences.Count
                    + idea.PlotBeatReferences.Count,
                idea.CreatedAt,
                idea.UpdatedAt,
                idea.DeletedAt,
            })
            .ToListAsync(cancellationToken);

        var items = rows
            .Select(row => new IdeaSummary(
                row.Id,
                row.Title,
                row.Excerpt,
                row.IsShortened,
                row.Universe,
                row.ReferenceCount,
                Utc(row.CreatedAt),
                Utc(row.UpdatedAt),
                row.DeletedAt is { } deletedAt ? Utc(deletedAt) : null))
            .ToList();

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new IdeaPage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var detail = await LoadDetailAsync(db, id, principal.RequireUserId(), cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> CreateAsync(
        [FromBody] IdeaRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        return await CreateCoreAsync(db, principal.RequireUserId(), request, cancellationToken);
    }

    /// <summary>
    /// The create itself, for <paramref name="ownerId"/> - the signed-in account, or the approver of an AI change who must be
    /// that same account (ADR 0048). In the caller's transaction when it has one.
    /// </summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorexDbContext db,
        string ownerId,
        IdeaRequest request,
        CancellationToken cancellationToken)
    {
        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var references = Requested(request.References);

        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        if (await CheckAssociationAsync(db, ownerId, request.UniverseId, references, [], cancellationToken) is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var now = DateTime.UtcNow;
        var idea = new Idea
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            UniverseId = request.UniverseId,
            Title = request.Title!.Trim(),
            Body = request.Body ?? string.Empty,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Ideas.Add(idea);
        IdeaReferences.Replace(db, idea.Id, [], references);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var created = await LoadDetailAsync(db, idea.Id, ownerId, cancellationToken);
        return Results.Created($"/api/ideas/{idea.Id}", created);
    }

    /// <summary>
    /// Saves the idea whole: title, body, universe and references together, so a change of universe and the references that
    /// go with it are one save, checked as one. Refused while the idea has changed since the edit began.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid id,
        [FromBody] IdeaRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        return await UpdateCoreAsync(db, principal.RequireUserId(), id, request, cancellationToken);
    }

    /// <summary>The save itself, for <paramref name="ownerId"/> as on <see cref="CreateCoreAsync"/>.</summary>
    internal static async Task<IResult> UpdateCoreAsync(
        LorexDbContext db,
        string ownerId,
        Guid id,
        IdeaRequest request,
        CancellationToken cancellationToken)
    {
        // One transaction for the comparison and the write, so nothing can land between them: SQLite has one writer.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        // Ownership before anything about the request is answered, so another account's idea is only ever a 404.
        var idea = await db.Ideas.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null,
            cancellationToken);
        if (idea is null)
        {
            return Results.NotFound();
        }

        if (Validate(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        if (!SameMoment(idea.UpdatedAt, request.ExpectedUpdatedAt))
        {
            return Changed(idea.UpdatedAt);
        }

        var references = Requested(request.References);
        var stored = await IdeaReferences.StoredAsync(db, idea.Id, cancellationToken);

        if (await CheckAssociationAsync(db, ownerId, request.UniverseId, references, stored, cancellationToken)
            is { } refused)
        {
            return Results.ValidationProblem(refused);
        }

        var title = request.Title!.Trim();
        var body = request.Body ?? string.Empty;
        var unchanged = string.Equals(idea.Title, title, StringComparison.Ordinal)
            && string.Equals(idea.Body, body, StringComparison.Ordinal)
            && idea.UniverseId == request.UniverseId
            && references.ToHashSet().SetEquals(stored);

        if (!unchanged)
        {
            idea.Title = title;
            idea.Body = body;
            idea.UniverseId = request.UniverseId;
            idea.UpdatedAt = DateTime.UtcNow;
            IdeaReferences.Replace(db, idea.Id, stored, references);
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, idea.Id, ownerId, cancellationToken));
    }

    /// <summary>
    /// Deletes the idea into the account's deleted ideas. Everything on it - title, body, universe, references - is kept and
    /// comes back with a restore. Deleting an idea that is already deleted is refused as missing rather than re-stamped.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        return await DeleteCoreAsync(db, principal.RequireUserId(), id, cancellationToken);
    }

    /// <summary>The idea into the account's deleted ideas, for <paramref name="ownerId"/> as on <see cref="CreateCoreAsync"/>.</summary>
    internal static async Task<IResult> DeleteCoreAsync(
        LorexDbContext db,
        string ownerId,
        Guid id,
        CancellationToken cancellationToken)
    {
        var idea = await db.Ideas.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null,
            cancellationToken);
        if (idea is null)
        {
            return Results.NotFound();
        }

        idea.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Brings a deleted idea back as it was. Its universe is still its universe unless that universe was deleted meanwhile, in
    /// which case it comes back unassigned with no references; a reference to something in the Trash is kept, marked.
    /// </summary>
    private static async Task<IResult> RestoreAsync(
        Guid id,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var ownerId = principal.RequireUserId();

        var idea = await db.Ideas.FirstOrDefaultAsync(
            candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt != null,
            cancellationToken);
        if (idea is null)
        {
            return Results.NotFound();
        }

        idea.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(await LoadDetailAsync(db, idea.Id, ownerId, cancellationToken));
    }

    /// <summary>
    /// What an idea in <paramref name="universeId"/> could newly reference: live targets of one kind, by name, narrowed by
    /// <paramref name="search"/>. A universe that is not the caller's answers 404.
    /// </summary>
    private static async Task<IResult> ListTargetsAsync(
        ClaimsPrincipal principal,
        LorexDbContext db,
        [FromQuery] Guid universeId,
        [FromQuery] IdeaReferenceKind kind,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null)
    {
        if (!await OwnsUniverseAsync(db, universeId, principal.RequireUserId(), cancellationToken))
        {
            return Results.NotFound();
        }

        if (!Enum.IsDefined(kind))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["kind"] = ["That is not something an idea can reference."],
            });
        }

        return Results.Ok(await IdeaReferences.TargetsAsync(db, universeId, kind, search, cancellationToken));
    }

    // ---------- Reading ----------

    /// <summary>One live idea of this account, whole, with its references resolved - or null.</summary>
    internal static async Task<IdeaDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid id,
        string ownerId,
        CancellationToken cancellationToken)
    {
        var idea = await db.Ideas.AsNoTracking()
            .Where(candidate => candidate.Id == id && candidate.OwnerId == ownerId && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Title,
                candidate.Body,
                Universe = candidate.UniverseId == null
                    ? null
                    : new IdeaUniverse(
                        candidate.Universe!.Id,
                        candidate.Universe.Name,
                        candidate.Universe.AccentColor,
                        candidate.Universe.IsArchived),
                candidate.CreatedAt,
                candidate.UpdatedAt,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (idea is null)
        {
            return null;
        }

        // An unassigned idea holds no references; an assigned one's are read only through its own universe.
        var references = idea.Universe is null
            ? []
            : await IdeaReferences.ResolveAsync(
                db,
                idea.Universe.Id,
                await IdeaReferences.StoredAsync(db, idea.Id, cancellationToken),
                cancellationToken);

        return new IdeaDetail(
            idea.Id,
            idea.Title,
            idea.Body,
            idea.Universe,
            references,
            Utc(idea.CreatedAt),
            Utc(idea.UpdatedAt));
    }

    // ---------- Checks ----------

    /// <summary>The request's own shape: a title, a body within bounds, references of kinds Lorex knows and not too many.</summary>
    private static Dictionary<string, string[]>? Validate(IdeaRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title))
        {
            errors["title"] = ["Give the idea a title, so you can find it again."];
        }
        else if (title.Length > IdeaLimits.TitleMaxLength)
        {
            errors["title"] = [$"Keep the title under {IdeaLimits.TitleMaxLength} characters."];
        }

        if (request.Body is { Length: > IdeaLimits.BodyMaxLength })
        {
            errors["body"] = [$"Keep the idea under {IdeaLimits.BodyMaxLength:N0} characters."];
        }

        if (request.References is { } references)
        {
            if (references.Any(reference => reference is null || !Enum.IsDefined(reference.Kind)))
            {
                errors["references"] = ["That is not something an idea can reference."];
            }
            else if (references.Distinct().Count() > IdeaLimits.MaxReferences)
            {
                errors["references"] = [$"An idea can reference up to {IdeaLimits.MaxReferences} things."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// The universe and references against what the account owns. The universe must be one of the caller's; references need a
    /// universe, and each must be in it. Something in the Trash cannot be newly referenced, but a reference already
    /// <paramref name="stored"/> may stay. Another account's universe or content is refused in exactly the words used for one
    /// that does not exist.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> CheckAssociationAsync(
        LorexDbContext db,
        string ownerId,
        Guid? universeId,
        List<IdeaReferenceInput> references,
        List<IdeaReferenceInput> stored,
        CancellationToken cancellationToken)
    {
        if (universeId is null)
        {
            return references.Count == 0
                ? null
                : new Dictionary<string, string[]>
                {
                    ["references"] =
                        ["An idea that belongs to no universe cannot reference anything. Remove the references, or choose a universe."],
                };
        }

        if (!await OwnsUniverseAsync(db, universeId.Value, ownerId, cancellationToken))
        {
            return new Dictionary<string, string[]>
            {
                ["universeId"] = ["Choose one of your universes, or none."],
            };
        }

        if (references.Count == 0)
        {
            return null;
        }

        var found = (await IdeaReferences.ResolveAsync(db, universeId.Value, references, cancellationToken))
            .ToDictionary(view => new IdeaReferenceInput(view.Kind, view.Id), view => view.IsInTrash);

        if (references.Any(reference => !found.ContainsKey(reference)))
        {
            return new Dictionary<string, string[]>
            {
                ["references"] = ["Something referenced is not in this idea's universe. References stay inside one universe."],
            };
        }

        var storedSet = stored.ToHashSet();
        if (references.Any(reference => found[reference] && !storedSet.Contains(reference)))
        {
            return new Dictionary<string, string[]>
            {
                ["references"] = ["Something in the Trash cannot be newly referenced. Restore it first."],
            };
        }

        return null;
    }

    /// <summary>The references a request names, each once.</summary>
    private static List<IdeaReferenceInput> Requested(IReadOnlyList<IdeaReferenceInput>? references) =>
        references is null ? [] : [.. references.Distinct()];

    /// <summary>Compared as UTC ticks: SQLite hands a stored moment back with no kind, and JSON may carry it either way.</summary>
    private static bool SameMoment(DateTime stored, DateTime? expected) =>
        expected is { } moment && Utc(stored).Ticks == Utc(moment).Ticks;

    private static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    /// <summary>
    /// The refusal for a stale save. Carries the stored <c>updatedAt</c>, so a client whose author has seen the warning and
    /// still means to keep their own version can name it and save again - a decision made by a person, never by a retry.
    /// </summary>
    private static IResult Changed(DateTime current) =>
        Results.Problem(
            title: "Idea changed",
            detail: "This idea was saved somewhere else after it was opened here. Nothing was overwritten.",
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = ChangedCode,
                ["updatedAt"] = Utc(current),
            });

    /// <summary>
    /// Whether the caller owns the universe. Deliberately owner-only, not <c>UniverseAccess</c>: an idea is account data,
    /// and membership of someone else's universe does not let one's ideas point into it (ADR 0041).
    /// </summary>
    private static Task<bool> OwnsUniverseAsync(
        LorexDbContext db,
        Guid universeId,
        string ownerId,
        CancellationToken cancellationToken) =>
        db.Universes.AnyAsync(universe => universe.Id == universeId && universe.OwnerId == ownerId, cancellationToken);

    /// <summary>Escapes the LIKE wildcards so a search for "100%" cannot match everything.</summary>
    internal static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
