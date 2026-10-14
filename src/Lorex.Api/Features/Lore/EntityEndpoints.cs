using System.Linq.Expressions;
using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Lore;

/// <summary>
/// Entity CRUD inside one universe. Ownership is checked once per request against the
/// universe, and every id that arrives from the client (type, field, option, referenced
/// entity, tag) is re-resolved inside that same universe before it is used.
/// </summary>
public static class EntityEndpoints
{
    private const int DefaultPageSize = 12;
    private const int MaxPageSize = 50;

    /// <summary>
    /// The most entries one mass create writes. Comfortably over the job it exists for - forty names - and small enough that
    /// the one transaction holding SQLite's writer (every row indexed and versioned, two rule sweeps) stays well under a
    /// second, and that a review list in a browser is still something an author reads. Mirrored by the web client.
    /// </summary>
    public const int MassCreateMaxEntries = 100;

    /// <summary>
    /// The most entries one bulk move to the Trash takes. The Lore browser selects within one page, at most 40, so this is
    /// headroom for the API rather than a screen's limit; it matches mass create, and a batch of trashes is cheaper than a
    /// batch of creates - one column set per entry and one reconciliation - under the same single writer.
    /// </summary>
    public const int BulkTrashMaxEntries = 100;

    /// <summary>
    /// The machine-readable marker on the 400 an entry write gets when it still carries the article - a client from before
    /// the article moved to its own route (ADR 0028).
    /// </summary>
    public const string ArticleMovedCode = "entity_article_moved";

    /// <summary>The machine-readable marker on the 409 for an entry save written over a version that is no longer current.</summary>
    public const string ChangedCode = "entity_changed";

    /// <summary>
    /// The one grid-card projection, shared because the listing now has two orderings and only
    /// one shape: browsing reads it straight off the entity, searching reads it off the entity
    /// the score was joined to.
    /// </summary>
    private static readonly Expression<Func<LoreEntity, EntitySummary>> ToSummary =
        entity => new EntitySummary(
            entity.Id,
            entity.Name,
            entity.Summary,
            entity.CanonStatus,
            entity.IsArchived,
            entity.EntityTypeId,
            entity.EntityType!.Name,
            entity.EntityType.Icon,
            entity.EntityType.AccentColor,
            entity.Aliases.OrderBy(alias => alias.Value).Select(alias => alias.Value).ToList(),
            entity.EntityTags.Select(link => link.Tag!.Name).OrderBy(name => name).ToList(),
            entity.Image == null
                ? null
                : new EntityImageRef(
                    entity.Image.AssetId,
                    entity.Image.ThumbnailId,
                    entity.Image.Width,
                    entity.Image.Height,
                    entity.Image.ContentType,
                    entity.Image.FileName,
                    entity.Image.ByteSize,
                    entity.Image.UploadedAt,
                    entity.Image.CropX == null
                        ? null
                        : new EntityImageCrop(
                            entity.Image.CropX.Value,
                            entity.Image.CropY!.Value,
                            entity.Image.CropWidth!.Value,
                            entity.Image.CropHeight!.Value)),
            entity.UpdatedAt,
            null);

    public static IEndpointRouteBuilder MapEntityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/entities")
            .WithTags("Entities")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListEntities");
        group.MapPost("/", CreateAsync).WithName("CreateEntity");
        group.MapPost("/bulk", BulkCreateAsync).WithName("BulkCreateEntities");
        group.MapPost("/bulk-trash", BulkTrashAsync).WithName("BulkTrashEntities");
        group.MapGet("/{entityId:guid}", GetAsync).WithName("GetEntity");
        group.MapPut("/{entityId:guid}", UpdateAsync).WithName("UpdateEntity");
        group.MapDelete("/{entityId:guid}", DeleteAsync).WithName("DeleteEntity");

        endpoints.MapGet("/api/universes/{universeId:guid}/tags", ListTagsAsync)
            .WithTags("Entities")
            .WithName("ListTags")
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] Guid? entityTypeId = null,
        [FromQuery] CanonStatus? canonStatus = null,
        [FromQuery] string? tag = null,
        [FromQuery] bool includeArchived = false,
        [FromQuery] bool familyTreeEligible = false,
        [FromQuery] bool includeDescendants = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize,
        [FromQuery(Name = "field")] string[]? field = null)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        // Custom-field filters, all checked before anything is read: one that does not resolve is refused, never dropped.
        var (fieldFilters, fieldErrors) = await EntityFieldFilters.ResolveAsync(
            db, universeId, entityTypeId, field ?? [], cancellationToken);
        if (fieldErrors is not null)
        {
            return Results.ValidationProblem(fieldErrors);
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        // The Trash is not a filter on this listing, it is outside it. An entry the author
        // threw away must not come back through browse, search, a tag or a picker, and
        // includeArchived deliberately does not reach it: archiving and trashing are
        // different statements about an entry.
        var query = db.Entities.AsNoTracking()
            .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null);

        if (!includeArchived)
        {
            query = query.Where(entity => !entity.IsArchived);
        }

        // Exact by default, as every caller has always had it. Lore's browser asks for the branch: the type and every type
        // nested beneath it at any depth, worked out here from the universe's small type graph rather than sent as a list.
        if (entityTypeId is { } typeId && includeDescendants)
        {
            var parentOf = await db.EntityTypes.AsNoTracking()
                .Where(type => type.UniverseId == universeId)
                .ToDictionaryAsync(type => type.Id, type => type.ParentId, cancellationToken);
            var branch = EntityTypeHierarchy.Branch(parentOf, typeId).ToList();
            query = query.Where(entity => branch.Contains(entity.EntityTypeId));
        }
        else if (entityTypeId is { } exactTypeId)
        {
            query = query.Where(entity => entity.EntityTypeId == exactTypeId);
        }

        if (canonStatus is { } status)
        {
            query = query.Where(entity => entity.CanonStatus == status);
        }

        // Before the count, the order and the page, like every other condition here (ADR 0007 amendment, 034).
        query = EntityFieldFilters.Apply(query, fieldFilters);

        // The Family Tree's pickers: only entries whose type the author made eligible, never by what the type is called.
        if (familyTreeEligible)
        {
            query = query.Where(entity => entity.EntityType!.FamilyTreeEligible);
        }

        if (!string.IsNullOrWhiteSpace(tag))
        {
            var slug = tag.Trim().ToLowerInvariant();
            query = query.Where(entity => entity.EntityTags.Any(link => link.Tag!.Slug == slug));
        }

        // Full text, over the name, the aliases, the summary and the article the author wrote -
        // never over the Tiptap JSON that carries it. The index answers only "which entries hold
        // these words"; every other question this listing asks - ownership, the Trash, archiving,
        // the type, the tag - is still answered by the columns below, so the index cannot
        // disagree with them about what is visible.
        IQueryable<EntitySearchMatch>? matches = null;
        string? expression = null;

        if (!string.IsNullOrWhiteSpace(search))
        {
            expression = EntitySearchIndex.BuildMatchExpression(search);

            // Something was typed, but not a single letter or digit in it. Nothing can match a
            // search for "%" and nothing did before either, so this is an empty page rather
            // than an unfiltered one - dropping the filter would answer a search with the whole
            // universe.
            if (expression is null)
            {
                return Results.Ok(new EntityPage([], page, pageSize, 0, 0));
            }

            matches = EntitySearchIndex.Match(db, expression);
        }

        var skip = (int)Math.Min((long)(page - 1) * pageSize, int.MaxValue);
        int totalCount;
        List<EntitySummary> items;

        if (matches is null)
        {
            // Browsing. Most recently authored first, which is the order the grid has always had.
            totalCount = await query.CountAsync(cancellationToken);
            items = await query
                .OrderByDescending(entity => entity.UpdatedAt)
                .ThenBy(entity => entity.Id)
                .Skip(skip)
                .Take(pageSize)
                .Select(ToSummary)
                .ToListAsync(cancellationToken);
        }
        else
        {
            // Searching. Best match first instead, because the article body is indexed now: a
            // name is worth more than an alias and an alias more than a passing mention, and
            // recency would otherwise bury the entry actually called what was typed under every
            // entry that merely mentions it. One index row per entry, so the join cannot
            // duplicate one. Id breaks a score tie, so a page boundary never lands mid-shuffle.
            var scored = query.Join(
                matches,
                entity => entity.Id,
                match => match.EntityId,
                (entity, match) => new { Entity = entity, match.Rank });

            totalCount = await scored.CountAsync(cancellationToken);

            // The scored query answers which entries are on this page and in what order, and
            // nothing else. A card's aliases and tags are read separately, by id: a correlated
            // collection cannot be projected through a join to a keyless row, and asking for one
            // is how you get a query EF Core refuses to translate at all.
            var ranked = await scored
                .OrderBy(row => row.Rank)
                .ThenBy(row => row.Entity.Id)
                .Skip(skip)
                .Take(pageSize)
                .Select(row => row.Entity.Id)
                .ToListAsync(cancellationToken);

            var cards = await db.Entities.AsNoTracking()
                .Where(entity => ranked.Contains(entity.Id))
                .Select(ToSummary)
                .ToListAsync(cancellationToken);

            // Back into rank order: the second query returned a set, not a sequence. At most one
            // page of ids, so this is a handful of lookups.
            var byId = cards.ToDictionary(card => card.Id);

            // Where an article matched, a few words around the match, so a hit that is not in the
            // name reads as why it is here. Cut by the index for this page's entries only: no
            // article travels, and no card costs a query of its own.
            var excerpts = await EntitySearchIndex.ArticleExcerptsAsync(db, expression!, ranked, cancellationToken);

            items = [.. ranked.Select(id => byId[id] with { ArticleExcerpt = excerpts.GetValueOrDefault(id) })];
        }

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);

        return Results.Ok(new EntityPage(items, page, pageSize, totalCount, totalPages));
    }

    private static async Task<IResult> GetAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        // A trashed entry is not reachable through the ordinary entity surface at all. It is
        // still owned, still stored and still listed in the Trash; here it is simply absent.
        var detail = await LoadDetailAsync(db, universeId, entityId, cancellationToken, liveOnly: true);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    /// <summary>
    /// Creating an entity can introduce a High finding: a new Canon entity may declare a birth
    /// after its death, or become a Canon participant a moment is already outside the lifespan
    /// of. So the write runs under the promotion gate, which rolls it back if it does.
    /// Ownership is proved first, so an unowned universe never costs a rule sweep.
    /// </summary>
    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] EntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (RefusedLegacyArticle(request) is { } refused)
        {
            return refused;
        }

        return await gate.RunAsync(
            universeId,
            token => CreateCoreAsync(universeId, request, principal.RequireUserId(), db, token),
            cancellationToken);
    }

    private static async Task<IResult> CreateCoreAsync(
        Guid universeId,
        EntityRequest request,
        string actorUserId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var (entity, problem) = await CreateEntryAsync(db, universeId, request, actorUserId, cancellationToken);

        if (problem is not null)
        {
            return problem;
        }

        var detail = await LoadDetailAsync(db, universeId, entity!.Id, cancellationToken);
        return Results.Created($"/api/universes/{universeId}/entities/{entity.Id}", detail);
    }

    /// <summary>
    /// Mass create: the basic shell of many entries - type, name, Canon status - in one write. Everything else an
    /// entry can hold starts empty, exactly as a single create that sent nothing else would leave it.
    ///
    /// All or nothing. The whole batch is checked first, so every row's problem is reported at once and by row; then
    /// every entry is created through <see cref="CreateEntryAsync"/>, the same path a single create takes, inside one
    /// run of the promotion gate. The batch is one candidate: it is assessed once, and a refusal or a failure anywhere
    /// in it takes every entry down with it, so a retry can never duplicate the half that got through. ADR 0012.
    /// </summary>
    private static async Task<IResult> BulkCreateAsync(
        Guid universeId,
        [FromBody] BulkEntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (await ValidateBatchAsync(db, universeId, request, cancellationToken) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var actorUserId = principal.RequireUserId();

        return await gate.RunAsync(
            universeId,
            async token =>
            {
                var created = new List<BulkCreatedEntity>(request.Entries!.Count);

                foreach (var row in request.Entries!)
                {
                    var (entity, problem) = await CreateEntryAsync(
                        db,
                        universeId,
                        new EntityRequest(row!.EntityTypeId, row.Name, null, row.CanonStatus, null, null, null),
                        actorUserId,
                        token);

                    // Unreachable once the batch has been checked, short of a type changing under this request. Passed
                    // out as it is; the gate rolls back every entry created before it.
                    if (problem is not null)
                    {
                        return problem;
                    }

                    created.Add(new BulkCreatedEntity(entity!.Id, entity.Name, entity.EntityTypeId, entity.CanonStatus));
                }

                return Results.Created((string?)null, new BulkEntityResponse(created));
            },
            cancellationToken);
    }

    /// <summary>
    /// Every problem in a batch, keyed by row (<c>entries[3].name</c>), or null when there is none. The same checks a
    /// single create makes - <see cref="LoreValidation.ValidateEntity"/> and a type from this universe - plus the two a
    /// batch needs: its size, and a type whose required fields a name-only entry cannot fill. Required fields are never
    /// dropped for a batch; the single create would refuse the same entry.
    /// </summary>
    private static async Task<Dictionary<string, string[]>?> ValidateBatchAsync(
        LorexDbContext db,
        Guid universeId,
        BulkEntityRequest request,
        CancellationToken cancellationToken)
    {
        var entries = request.Entries;

        if (entries is not { Count: > 0 })
        {
            return new Dictionary<string, string[]> { ["entries"] = ["Add at least one entry."] };
        }

        if (entries.Count > MassCreateMaxEntries)
        {
            return new Dictionary<string, string[]>
            {
                ["entries"] = [$"Create up to {MassCreateMaxEntries} entries at a time. This has {entries.Count}."],
            };
        }

        // A type from elsewhere is simply absent here, so it is refused exactly like an unknown one and discloses nothing.
        var types = await db.EntityTypes.AsNoTracking()
            .Where(type => type.UniverseId == universeId)
            .Select(type => new { type.Id, type.Name, HasRequiredFields = type.Fields.Any(field => field.IsRequired) })
            .ToDictionaryAsync(type => type.Id, cancellationToken);

        var errors = new Dictionary<string, string[]>();

        for (var index = 0; index < entries.Count; index++)
        {
            var row = entries[index];
            var at = $"entries[{index}]";

            if (row is null)
            {
                errors[at] = ["Send a type, a name and a status for every entry."];
                continue;
            }

            var single = new EntityRequest(row.EntityTypeId, row.Name, null, row.CanonStatus, null, null, null);
            foreach (var (key, messages) in LoreValidation.ValidateEntity(single) ?? [])
            {
                errors[$"{at}.{key}"] = messages;
            }

            if (!types.TryGetValue(row.EntityTypeId, out var type))
            {
                errors[$"{at}.entityTypeId"] = ["Choose a type from this universe."];
            }
            else if (type.HasRequiredFields)
            {
                errors[$"{at}.entityTypeId"] =
                    [$"{type.Name} has required fields, so its entries are created one at a time."];
            }
        }

        return errors.Count == 0 ? null : errors;
    }

    /// <summary>
    /// The one way an entry comes into being, for a single create and for every row of a mass create alike: validated,
    /// its type resolved inside this universe, its aliases, tags and field values written - required fields included -
    /// then indexed for search and given its Created version. Runs inside the caller's promotion-gate transaction, so a
    /// refused or failed write takes the entry, its index row and its first version down together.
    /// </summary>
    private static async Task<(LoreEntity? Entity, IResult? Problem)> CreateEntryAsync(
        LorexDbContext db,
        Guid universeId,
        EntityRequest request,
        string actorUserId,
        CancellationToken cancellationToken)
    {
        if (await CheckEntryAsync(db, universeId, request, cancellationToken) is { } refused)
        {
            return (null, refused);
        }

        var now = DateTime.UtcNow;
        var entity = new LoreEntity
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            EntityTypeId = request.EntityTypeId,
            Name = request.Name!.Trim(),
            Summary = LoreValidation.Normalize(request.Summary),
            CanonStatus = request.CanonStatus,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.Entities.Add(entity);

        if (await ApplyAliasesTagsAndFieldsAsync(db, universeId, entity, request, cancellationToken)
            is { } problem)
        {
            return (null, problem);
        }

        await db.SaveChangesAsync(cancellationToken);

        // Also inside the gate's transaction: a refused candidate is not searchable, because it
        // does not exist.
        await EntitySearchIndex.ReindexAsync(db, entity.Id, cancellationToken);

        // Inside the gate's transaction, so a candidate that is refused takes its first
        // version down with it.
        await EntityRevisions.CaptureAsync(
            db, entity.Id, EntityRevisionKind.Created, restoredFromRevisionId: null, actorUserId, cancellationToken);

        return (entity, null);
    }

    /// <summary>
    /// The structured-field edit path, and the one most likely to break a lifespan: this is
    /// where a birth or death year is written, and where an entity is promoted to Canon. Gated
    /// for both reasons.
    /// </summary>
    private static async Task<IResult> UpdateAsync(
        Guid universeId,
        Guid entityId,
        [FromBody] EntityRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate gate,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        if (RefusedLegacyArticle(request) is { } refused)
        {
            return refused;
        }

        return await gate.RunAsync(
            universeId,
            token => UpdateCoreAsync(universeId, entityId, request, principal.RequireUserId(), db, token),
            cancellationToken);
    }

    /// <summary>The 409 for an entry save written over a version that is no longer current (ADR 0043).</summary>
    internal static IResult Changed(int currentVersion) =>
        EditVersion.Changed(
            ChangedCode,
            "Entry changed",
            "This entry was changed after it was opened here. Nothing was overwritten.",
            currentVersion);

    /// <summary>
    /// The entry's own checks - its fields' shapes, and a type of this universe - before anything is written. Shared by
    /// create, update and a suggestion (ADR 0044), which writes nothing at all. A type id from elsewhere is treated as
    /// absent rather than reported, so it discloses nothing.
    /// </summary>
    internal static async Task<IResult?> CheckEntryAsync(
        LorexDbContext db,
        Guid universeId,
        EntityRequest request,
        CancellationToken cancellationToken)
    {
        if (LoreValidation.ValidateEntity(request) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var typeExists = await db.EntityTypes.AnyAsync(
            type => type.Id == request.EntityTypeId && type.UniverseId == universeId,
            cancellationToken);

        return typeExists
            ? null
            : Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["entityTypeId"] = ["Choose a type from this universe."],
            });
    }

    /// <summary>
    /// An entry write that still carries the article is refused whole, before anything runs: nothing about the entry is
    /// saved, and the article is saved neither here nor anywhere else. Saving the entry and dropping the article would answer
    /// an author's save with success over lost prose. Checked after ownership, so a stranger still learns nothing, and
    /// never forwarded to the article route - a write that names no <c>updatedAt</c> could overwrite a newer article.
    /// </summary>
    internal static IResult? RefusedLegacyArticle(EntityRequest request) =>
        request.CarriesLegacyArticle
            ? Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["content"] = ["An entry's article is saved on its own now. Reload Lorex, then save the article again."],
                },
                detail: "This request sent the entry's article with the entry. An article is saved on its own route, "
                    + ".../entities/{entityId}/article, so nothing was saved - neither the entry nor its article. "
                    + "Reload Lorex to use the current editor.",
                title: "Article sent with the entry",
                extensions: new Dictionary<string, object?> { ["code"] = ArticleMovedCode })
            : null;

    /// <summary>
    /// The one write path for an existing entry, shared with the restore route so a restored
    /// version is validated, gated, reconciled and recorded exactly like an ordinary edit.
    /// <paramref name="kind"/> and <paramref name="restoredFromRevisionId"/> change nothing
    /// about the write; they only say what the resulting revision is called. <paramref name="actorUserId"/> is who made it.
    /// </summary>
    internal static async Task<IResult> UpdateCoreAsync(
        Guid universeId,
        Guid entityId,
        EntityRequest request,
        string actorUserId,
        LorexDbContext db,
        CancellationToken cancellationToken,
        EntityRevisionKind kind = EntityRevisionKind.Edited,
        Guid? restoredFromRevisionId = null)
    {
        // Trashed is not editable. Restore is the only write a trashed entry accepts, and it
        // puts back exactly what was stored - so nothing here can quietly rewrite it first.
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // Read inside the transaction the write commits in - the gate's, or the restore's under it - so nothing can land
        // between this comparison and the write.
        if (!EditVersion.Matches(entity.Version, request.ExpectedVersion))
        {
            return Changed(entity.Version);
        }

        if (await CheckEntryAsync(db, universeId, request, cancellationToken) is { } refused)
        {
            return refused;
        }

        entity.EntityTypeId = request.EntityTypeId;
        entity.Name = request.Name!.Trim();
        entity.Summary = LoreValidation.Normalize(request.Summary);
        entity.CanonStatus = request.CanonStatus;
        entity.UpdatedAt = DateTime.UtcNow;

        // The client always sends the complete set it wants stored, so the children are
        // replaced wholesale. The old rows are deleted straight against the database
        // first: EF Core does not promise to order deletes ahead of inserts within one
        // SaveChanges, and re-saving an unchanged alias or tag would then collide with the
        // row still in the table. The transaction keeps the two steps atomic - and joins the
        // promotion gate's rather than nesting inside it.
        await using var transaction = await JoinedTransaction.BeginAsync(db, cancellationToken);

        await db.EntityAliases.Where(alias => alias.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.EntityTags.Where(link => link.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.EntityFieldValues.Where(value => value.EntityId == entityId)
            .ExecuteDeleteAsync(cancellationToken);

        if (await ApplyAliasesTagsAndFieldsAsync(db, universeId, entity, request, cancellationToken)
            is { } problem)
        {
            return problem;
        }

        await db.SaveChangesAsync(cancellationToken);

        // Every structured edit that can change indexed text arrives here - a rename, a new
        // summary, an alias added or dropped, and a revision restore, which is this same method
        // replaying an old version. The article's own save reindexes on its route. Both run inside
        // the transaction the write itself commits in.
        await EntitySearchIndex.ReindexAsync(db, entity.Id, cancellationToken);

        // Before the commit, and inside the gate's transaction when there is one: the edit and
        // the version it produced land together or neither does. A write that changed nothing
        // records nothing.
        // A write that changed the entry - the same judgement its history makes - moves its version on, exactly once; an
        // unchanged save leaves every other open form current.
        if (await EntityRevisions.CaptureAsync(db, entity.Id, kind, restoredFromRevisionId, actorUserId, cancellationToken))
        {
            entity.Version++;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);

        var detail = await LoadDetailAsync(db, universeId, entity.Id, cancellationToken);
        return Results.Ok(detail);
    }

    /// <summary>
    /// Moves the entry to the Trash. Nothing is erased: the row stays, and so does every row
    /// that points at it - aliases, values, tags, relationships from both ends, timeline
    /// participation and the whole revision history. It simply stops being live.
    ///
    /// Reconciled but not gated, exactly as the destructive delete this replaced was. Every
    /// rule reads facts an entity contributes - its declared years, its Canon participation,
    /// the relationships and references that rest on it - and a trashed entry contributes
    /// none of them, so taking it out of the live set can only remove findings. There is
    /// nothing to refuse. Those findings do have to stop being reported, which is what
    /// <see cref="CanonPromotionGate.RecordAsync"/> is for: a conflict about lore the author
    /// has thrown away is worse than no conflict at all.
    ///
    /// See <c>docs/architecture/decisions/0015-entity-trash-and-restore.md</c>.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid entityId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await canon.RecordAsync(
            universeId,
            token => TrashCoreAsync(universeId, entityId, db, token),
            cancellationToken);
    }

    /// <summary>
    /// Moves many entries to the Trash at once, all or nothing: exactly what <see cref="DeleteAsync"/> does to one, for
    /// each of them, inside one transaction and one Canon reconciliation. Nothing is erased - every entry keeps its
    /// article, fields, relationships, history and type, and restores from the Trash on its own, as ever.
    ///
    /// Checked whole before anything is written. An id that is not a live entry of this universe - unknown, another
    /// universe's, or already in the Trash - refuses the whole request in the same words, so it confirms nothing about
    /// what exists elsewhere, and a request naming one twice is refused rather than read loosely.
    /// </summary>
    private static async Task<IResult> BulkTrashAsync(
        Guid universeId,
        [FromBody] BulkTrashRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.ManageTrash, cancellationToken) is { } denied)
        {
            return denied;
        }

        var ids = request.EntityIds;

        if (ids is not { Count: > 0 })
        {
            return EntityIdsProblem("Choose at least one entry.");
        }

        if (ids.Count > BulkTrashMaxEntries)
        {
            return EntityIdsProblem($"Move up to {BulkTrashMaxEntries} entries at a time. This has {ids.Count}.");
        }

        if (ids.Distinct().Count() != ids.Count)
        {
            return EntityIdsProblem("The same entry is listed more than once.");
        }

        var live = (await db.Entities.AsNoTracking()
                .Where(entity => entity.UniverseId == universeId && entity.DeletedAt == null && ids.Contains(entity.Id))
                .Select(entity => entity.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        var errors = new Dictionary<string, string[]>();
        for (var index = 0; index < ids.Count; index++)
        {
            if (!live.Contains(ids[index]))
            {
                errors[$"entityIds[{index}]"] = ["This entry is not in Lore any more. It may already be in the Trash."];
            }
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        return await canon.RecordAsync(
            universeId,
            async token =>
            {
                foreach (var id in ids)
                {
                    // Unreachable once checked, short of the entry being trashed under this request; the transaction
                    // then takes every earlier one back with it.
                    if (await TrashCoreAsync(universeId, id, db, token) is IStatusCodeHttpResult { StatusCode: 404 } missing)
                    {
                        return (IResult)missing;
                    }
                }

                return Results.Ok(new BulkTrashResponse(ids.Count));
            },
            cancellationToken);
    }

    private static IResult EntityIdsProblem(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["entityIds"] = [message] });

    /// <summary>
    /// Marks one live entry as trashed. An entry already in the Trash answers 404 rather than
    /// having its timestamp rewritten, so trashing twice cannot quietly move the moment the
    /// author threw it away.
    /// </summary>
    internal static async Task<IResult> TrashCoreAsync(
        Guid universeId,
        Guid entityId,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        var entity = await db.Entities.FirstOrDefaultAsync(
            candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && candidate.DeletedAt == null,
            cancellationToken);

        if (entity is null)
        {
            return Results.NotFound();
        }

        // UpdatedAt is left alone. It says when the lore was last authored, and being thrown
        // away is not an edit to it - the Trash reads DeletedAt for its own ordering.
        //
        // The search index is left alone too, and deliberately: it holds text, not lifecycle.
        // Search reads DeletedAt off this very row, so the entry stops being findable the moment
        // this column is set, and a restore makes it findable again with nothing to rebuild.
        entity.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> ListTagsAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        // Counted over live entries only, because this list is the browse filter: a tag
        // promising three entries and then filtering to none would be a lie about the Trash.
        var tags = await db.Tags.AsNoTracking()
            .Where(tag => tag.UniverseId == universeId)
            .OrderBy(tag => tag.Name)
            .Select(tag => new TagResponse(
                tag.Id,
                tag.Name,
                tag.EntityTags.Count(link => link.Entity!.DeletedAt == null)))
            .ToListAsync(cancellationToken);

        return Results.Ok(tags);
    }

    // ---------- Writing the child collections ----------

    /// <summary>Returns a problem result when something in the request is not usable, else null.</summary>
    private static async Task<IResult?> ApplyAliasesTagsAndFieldsAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        EntityRequest request,
        CancellationToken cancellationToken)
    {
        AddAliases(db, entity, request.Aliases);

        if (await AddTagsAsync(db, universeId, entity, request.Tags, cancellationToken) is { } tagProblem)
        {
            return tagProblem;
        }

        return await AddFieldValuesAsync(db, universeId, entity, request, cancellationToken);
    }

    private static void AddAliases(LorexDbContext db, LoreEntity entity, IReadOnlyList<string>? aliases)
    {
        foreach (var value in NormalizedAliases(aliases))
        {
            db.EntityAliases.Add(new EntityAlias
            {
                Id = Guid.NewGuid(),
                EntityId = entity.Id,
                Value = value,
            });
        }
    }

    /// <summary>The aliases a save stores: trimmed, blanks dropped, each once ignoring case, first spelling kept.</summary>
    internal static List<string> NormalizedAliases(IReadOnlyList<string>? aliases)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var kept = new List<string>();

        foreach (var raw in aliases ?? [])
        {
            var value = raw?.Trim();
            if (!string.IsNullOrWhiteSpace(value) && seen.Add(value))
            {
                kept.Add(value);
            }
        }

        return kept;
    }

    /// <summary>The tags a save asks for, by slug (lower case) with the first spelling given: trimmed, blanks dropped.</summary>
    internal static Dictionary<string, string> NormalizedTags(IReadOnlyList<string>? tags)
    {
        var wanted = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var raw in tags ?? [])
        {
            var name = raw?.Trim();
            if (!string.IsNullOrWhiteSpace(name))
            {
                wanted.TryAdd(name.ToLowerInvariant(), name);
            }
        }

        return wanted;
    }

    private static async Task<IResult?> AddTagsAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        IReadOnlyList<string>? tags,
        CancellationToken cancellationToken)
    {
        var wanted = NormalizedTags(tags);

        if (wanted.Count == 0)
        {
            return null;
        }

        var slugs = wanted.Keys.ToList();

        // Tags live in the universe, so an existing one is reused and a new one is created
        // here. A tag id is never accepted from the client.
        var existing = await db.Tags
            .Where(tag => tag.UniverseId == universeId && slugs.Contains(tag.Slug))
            .ToListAsync(cancellationToken);

        var bySlug = existing.ToDictionary(tag => tag.Slug, StringComparer.Ordinal);

        foreach (var (slug, name) in wanted)
        {
            if (!bySlug.TryGetValue(slug, out var tag))
            {
                tag = new Tag
                {
                    Id = Guid.NewGuid(),
                    UniverseId = universeId,
                    Name = name,
                    Slug = slug,
                };
                db.Tags.Add(tag);
                bySlug[slug] = tag;
            }

            db.EntityTags.Add(new EntityTag { EntityId = entity.Id, TagId = tag.Id });
        }

        return null;
    }

    private static async Task<IResult?> AddFieldValuesAsync(
        LorexDbContext db,
        Guid universeId,
        LoreEntity entity,
        EntityRequest request,
        CancellationToken cancellationToken)
    {
        var prepared = await PrepareFieldValuesAsync(db, universeId, entity.Id, request, cancellationToken);
        db.EntityFieldValues.AddRange(prepared.Rows);

        return prepared.Errors.Count == 0 ? null : Results.ValidationProblem(prepared.Errors);
    }

    /// <summary>
    /// The field values a save would store for <paramref name="entityId"/>, validated against the chosen type's own fields -
    /// as rows not yet added to anything - with what is wrong, keyed by field. Reads only. Shared by the save and by a
    /// suggestion (ADR 0044), which writes nothing at all.
    /// </summary>
    internal static async Task<(List<EntityFieldDefinition> Definitions, List<EntityFieldValue> Rows, Dictionary<string, string[]> Errors)>
        PrepareFieldValuesAsync(
            LorexDbContext db,
            Guid universeId,
            Guid entityId,
            EntityRequest request,
            CancellationToken cancellationToken)
    {
        // Only fields belonging to the chosen type, in this universe, are addressable.
        var definitions = await db.EntityFieldDefinitions.AsNoTracking()
            .Include(field => field.Options)
            .Where(field => field.EntityTypeId == request.EntityTypeId
                && field.EntityType!.UniverseId == universeId)
            .ToListAsync(cancellationToken);

        var byId = definitions.ToDictionary(field => field.Id);
        var supplied = new Dictionary<Guid, FieldValueInput>();
        var chronology = await UniverseChronology.LoadAsync(db, universeId, cancellationToken);

        foreach (var input in request.Fields ?? [])
        {
            // A field id that is not on this type is ignored rather than reported, so the
            // response cannot confirm that some other field exists.
            if (byId.ContainsKey(input.FieldDefinitionId))
            {
                supplied[input.FieldDefinitionId] = input;
            }
        }

        var errors = new Dictionary<string, string[]>();

        // Every entry a link field names, read once with its type, and only from this universe: what each field then accepts
        // is decided from that, however many link fields the type has.
        var wanted = definitions
            .Where(definition => definition.Kind == EntityFieldKind.EntityReference)
            .Select(definition => supplied.GetValueOrDefault(definition.Id)?.ReferencedEntityId)
            .OfType<Guid>()
            .Distinct()
            .ToList();

        var referenced = wanted.Count == 0
            ? []
            : await db.Entities.AsNoTracking()
                .Where(candidate => candidate.UniverseId == universeId && wanted.Contains(candidate.Id))
                .ToDictionaryAsync(candidate => candidate.Id, candidate => candidate.EntityTypeId, cancellationToken);

        var rows = new List<EntityFieldValue>();

        foreach (var definition in definitions)
        {
            supplied.TryGetValue(definition.Id, out var input);

            var built = BuildRows(entityId, definition, input, chronology, referenced, errors);

            if (definition.IsRequired && built.Count == 0)
            {
                errors[definition.Id.ToString()] = [$"{definition.Name} is required."];
            }

            rows.AddRange(built);
        }

        return (definitions, rows, errors);
    }

    /// <param name="referenced">This universe's entries the request links to, each with its type.</param>
    private static List<EntityFieldValue> BuildRows(
        Guid entityId,
        EntityFieldDefinition definition,
        FieldValueInput? input,
        UniverseChronology chronology,
        Dictionary<Guid, Guid> referenced,
        Dictionary<string, string[]> errors)
    {
        var rows = new List<EntityFieldValue>();

        if (input is null)
        {
            return rows;
        }

        EntityFieldValue New() => new()
        {
            Id = Guid.NewGuid(),
            EntityId = entityId,
            FieldDefinitionId = definition.Id,
        };

        switch (definition.Kind)
        {
            case EntityFieldKind.ShortText:
            case EntityFieldKind.LongText:
            {
                var text = LoreValidation.Normalize(input.Text);
                if (text is null)
                {
                    break;
                }

                if (text.Length > LoreLimits.TextValueMaxLength)
                {
                    errors[definition.Id.ToString()] = [$"{definition.Name} is too long."];
                    break;
                }

                var row = New();
                row.TextValue = text;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Number:
            {
                if (input.Number is not { } number)
                {
                    break;
                }

                if (double.IsNaN(number) || double.IsInfinity(number))
                {
                    errors[definition.Id.ToString()] = [$"{definition.Name} must be a number."];
                    break;
                }

                if (EraProblem(definition, number, input.EraId, chronology) is { } eraProblem)
                {
                    errors[definition.Id.ToString()] = [eraProblem];
                    break;
                }

                var row = New();
                row.NumberValue = number;
                row.EraId = input.EraId;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Boolean:
            {
                if (input.Boolean is not { } flag)
                {
                    break;
                }

                var row = New();
                row.BooleanValue = flag;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Date:
            {
                if (input.Date is not { } date)
                {
                    break;
                }

                var row = New();
                row.DateValue = date;
                rows.Add(row);
                break;
            }

            case EntityFieldKind.Select:
            case EntityFieldKind.MultiSelect:
            {
                var allowed = definition.Options.Select(option => option.Id).ToHashSet();
                var chosen = (input.OptionIds ?? []).Where(allowed.Contains).Distinct().ToList();

                if (definition.Kind == EntityFieldKind.Select && chosen.Count > 1)
                {
                    chosen = [chosen[0]];
                }

                foreach (var optionId in chosen)
                {
                    var row = New();
                    row.OptionId = optionId;
                    rows.Add(row);
                }

                break;
            }

            case EntityFieldKind.EntityReference:
            {
                if (input.ReferencedEntityId is not { } referenceId)
                {
                    break;
                }

                // The target must be in the same universe, so a reference cannot be used
                // to probe for entities elsewhere.
                //
                // A target in the Trash is deliberately still writable. The client sends its
                // whole field set on every save, so refusing one would turn any unrelated
                // edit to this entry into a validation failure - or, worse, silently drop the
                // reference. Discoverability is the picker's job: the entity listing never
                // offers a trashed entry, so a *new* reference to one cannot be authored.
                //
                // A field limited to one type accepts entries of exactly that type, checked here whatever the picker
                // offered. A trashed entry still has its type, so a kept link is checked like any other. An entry of
                // another universe gets the same answer as one of the wrong type, and says nothing about itself.
                if (!referenced.TryGetValue(referenceId, out var referencedType))
                {
                    errors[definition.Id.ToString()] = definition.TargetEntityTypeId is null
                        ? [$"{definition.Name} must point at an entity in this universe."]
                        : [WrongTarget(definition)];
                    break;
                }

                if (definition.TargetEntityTypeId is { } target && referencedType != target)
                {
                    errors[definition.Id.ToString()] = [WrongTarget(definition)];
                    break;
                }

                var row = New();
                row.ReferencedEntityId = referenceId;
                rows.Add(row);
                break;
            }

            default:
                break;
        }

        return rows;
    }

    /// <summary>The one refusal for a link a limited field does not allow: wrong type, missing or not this universe's.</summary>
    private static string WrongTarget(EntityFieldDefinition definition) =>
        $"{definition.Name} can only link to an entry of the type it allows. Choose another entry.";

    /// <summary>
    /// What is wrong with the era a number arrived with, or null when nothing is.
    ///
    /// A birth or death year is what the chronology rules place against the timeline, so on a
    /// universe that names eras it must say which one - a bare number there is a year in no era,
    /// and Lorex does not guess. Any other number may carry an era or not. A universe that names
    /// no eras has none to carry, and an id from another universe resolves the same way as one
    /// that is not an era at all.
    /// </summary>
    private static string? EraProblem(
        EntityFieldDefinition definition,
        double number,
        Guid? eraId,
        UniverseChronology chronology)
    {
        if (eraId is null)
        {
            var isYear = definition.Semantic is EntityFieldSemantic.BirthYear or EntityFieldSemantic.DeathYear;

            return isYear && chronology.NamesEras
                ? $"Choose the date period {definition.Name} is counted in."
                : null;
        }

        if (chronology.Era(eraId) is null)
        {
            return chronology.NamesEras
                ? $"{definition.Name} must use one of this universe's date periods."
                : $"{definition.Name} cannot have a date period, because this universe has none.";
        }

        return ChronologyPoint.IsEraYear(number)
            ? null
            : $"{definition.Name} is a year inside a date period, so it is a whole number from 1.";
    }

    // ---------- Reading ----------

    /// <summary>
    /// One entry for the reader. <paramref name="liveOnly"/> is what the ordinary entity
    /// surface passes; the write paths and the restore leave it false, because they have
    /// already decided what they are looking at and are describing what they just stored.
    /// </summary>
    internal static async Task<EntityDetail?> LoadDetailAsync(
        LorexDbContext db,
        Guid universeId,
        Guid entityId,
        CancellationToken cancellationToken,
        bool liveOnly = false)
    {
        var entity = await db.Entities.AsNoTracking()
            .Where(candidate => candidate.Id == entityId
                && candidate.UniverseId == universeId
                && (!liveOnly || candidate.DeletedAt == null))
            .Select(candidate => new
            {
                candidate.Id,
                candidate.Name,
                candidate.Summary,
                candidate.CanonStatus,
                candidate.IsArchived,
                candidate.EntityTypeId,
                TypeName = candidate.EntityType!.Name,
                TypeIcon = candidate.EntityType.Icon,
                TypeAccent = candidate.EntityType.AccentColor,
                Aliases = candidate.Aliases.OrderBy(alias => alias.Value)
                    .Select(alias => alias.Value).ToList(),
                Tags = candidate.EntityTags.Select(link => link.Tag!.Name)
                    .OrderBy(name => name).ToList(),
                Values = candidate.FieldValues.Select(value => new
                {
                    value.FieldDefinitionId,
                    FieldName = value.FieldDefinition!.Name,
                    value.FieldDefinition.Kind,
                    value.FieldDefinition.DisplayOrder,
                    value.TextValue,
                    value.NumberValue,
                    value.EraId,
                    value.BooleanValue,
                    value.DateValue,
                    value.OptionId,
                    OptionValue = value.Option != null ? value.Option.Value : null,
                    value.ReferencedEntityId,
                    ReferencedName = value.ReferencedEntity != null ? value.ReferencedEntity.Name : null,
                    ReferencedTrashed = value.ReferencedEntity != null
                        && value.ReferencedEntity.DeletedAt != null,
                }).ToList(),
                Image = candidate.Image == null
                    ? null
                    : new EntityImageRef(
                        candidate.Image.AssetId,
                        candidate.Image.ThumbnailId,
                        candidate.Image.Width,
                        candidate.Image.Height,
                        candidate.Image.ContentType,
                        candidate.Image.FileName,
                        candidate.Image.ByteSize,
                        candidate.Image.UploadedAt,
                        candidate.Image.CropX == null
                            ? null
                            : new EntityImageCrop(
                                candidate.Image.CropX.Value,
                                candidate.Image.CropY!.Value,
                                candidate.Image.CropWidth!.Value,
                                candidate.Image.CropHeight!.Value)),
                candidate.CreatedAt,
                candidate.UpdatedAt,
                candidate.Version,
                // Whatever its type, an entry that already holds a live family link keeps its way into the Family Tree (ADR 0040).
                HasFamilyConnections = db.Relationships.Any(relationship =>
                    relationship.UniverseId == universeId
                    && relationship.RelationshipType!.FamilySemantic != RelationshipFamilySemantic.None
                    && ((relationship.SourceEntityId == candidate.Id && relationship.TargetEntity!.DeletedAt == null)
                        || (relationship.TargetEntityId == candidate.Id && relationship.SourceEntity!.DeletedAt == null))),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (entity is null)
        {
            return null;
        }

        // Multi-select stores one row per option, so rows are folded back into one value
        // per field for the client.
        var fields = entity.Values
            .GroupBy(value => new { value.FieldDefinitionId, value.FieldName, value.Kind, value.DisplayOrder })
            .OrderBy(group => group.Key.DisplayOrder)
            .ThenBy(group => group.Key.FieldName)
            .Select(group => new FieldValueResponse(
                group.Key.FieldDefinitionId,
                group.Key.FieldName,
                group.Key.Kind,
                group.Select(value => value.TextValue).FirstOrDefault(text => text != null),
                group.Select(value => value.NumberValue).FirstOrDefault(number => number != null),
                group.Select(value => value.BooleanValue).FirstOrDefault(flag => flag != null),
                group.Select(value => value.DateValue).FirstOrDefault(date => date != null),
                group.Where(value => value.OptionId != null).Select(value => value.OptionId!.Value).ToList(),
                group.Where(value => value.OptionValue != null).Select(value => value.OptionValue!).ToList(),
                group.Select(value => value.ReferencedEntityId).FirstOrDefault(id => id != null),
                group.Select(value => value.ReferencedName).FirstOrDefault(name => name != null),
                group.Any(value => value.ReferencedTrashed),
                group.Select(value => value.EraId).FirstOrDefault(id => id != null)))
            .ToList();

        return new EntityDetail(
            entity.Id,
            entity.Name,
            entity.Summary,
            entity.CanonStatus,
            entity.IsArchived,
            entity.EntityTypeId,
            entity.TypeName,
            entity.TypeIcon,
            entity.TypeAccent,
            entity.Aliases,
            entity.Tags,
            fields,
            entity.Image,
            entity.CreatedAt,
            entity.UpdatedAt,
            entity.HasFamilyConnections,
            entity.Version);
    }
}
