using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Comments;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Every private route under a universe, asked by every role (ADR 0041). The catalog below is written out by hand from
/// the permission matrix - not derived from <see cref="UniverseAccess.Allows"/> - so the code is held to the decision,
/// not to itself. A route added under a universe and left out of here is a gap: <see cref="Every_universe_route_is_in_the_catalog"/>
/// fails until it is classified.
///
/// Refusals change nothing, so one universe serves every refusal; what members may do runs in
/// <see cref="UniverseCollaborationTests"/>.
/// </summary>
public sealed class UniverseAccessMatrixTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private readonly LorexApiFactory _factory = factory;

    /// <summary>Who may use a route.</summary>
    private enum May
    {
        /// <summary>Every member: owner, Editor, Reviewer, Viewer.</summary>
        Read,

        /// <summary>The owner, Editors and Reviewers: review comments (043).</summary>
        Comment,

        /// <summary>The owner and Editors.</summary>
        Edit,

        /// <summary>The owner alone.</summary>
        Own,
    }

    private sealed record Call(string Name, HttpMethod Method, string Path, May May, Func<HttpContent?>? Body = null)
    {
        public HttpRequestMessage Request(string path) => new(Method, path) { Content = Body?.Invoke() };
    }

    private static Func<HttpContent?> Json(object body) => () => JsonContent.Create(body);

    private static readonly HttpMethod Get = HttpMethod.Get;
    private static readonly HttpMethod Post = HttpMethod.Post;
    private static readonly HttpMethod Put = HttpMethod.Put;
    private static readonly HttpMethod Delete = HttpMethod.Delete;

    /// <summary>Every route that names a universe, with a body that would be accepted. Ids the gate never reaches are random.</summary>
    private static List<Call> Catalog(SharedWorld w)
    {
        var u = $"/api/universes/{w.U}";
        var e = $"{u}/entities/{w.Entry}";
        var s = $"{u}/stories/{w.Story}";
        var scene = $"{s}/scenes/{w.Scene}";
        var t = $"{u}/trash";
        var any = Guid.NewGuid();
        var entry = new EntityRequest(w.CharacterType, "Ember Vale", "Edited.", CanonStatus.Canon, null, null, null);

        return
        [
            // ---------- The universe itself ----------
            new("universe", Get, u, May.Read),
            new("rename universe", Put, u, May.Own, Json(new UpdateUniverseRequest("Renamed", "Changed", "#112233"))),
            new("archive universe", Post, $"{u}/archive", May.Own),
            new("unarchive universe", Post, $"{u}/unarchive", May.Own),
            new("delete universe", Delete, u, May.Own),

            // ---------- Lore ----------
            new("entries", Get, $"{u}/entities", May.Read),
            new("entry", Get, e, May.Read),
            new("tags", Get, $"{u}/tags", May.Read),
            new("create entry", Post, $"{u}/entities", May.Edit, Json(entry with { Name = "New one" })),
            new("bulk create", Post, $"{u}/entities/bulk", May.Edit, Json(new BulkEntityRequest([new BulkEntityRow(w.CharacterType, "Bulk one", CanonStatus.Canon)]))),
            new("edit entry", Put, e, May.Edit, Json(entry)),
            new("trash entry", Delete, $"{u}/entities/{w.Other}", May.Edit),
            new("bulk trash", Post, $"{u}/entities/bulk-trash", May.Edit, Json(new BulkTrashRequest([w.Other]))),

            new("types", Get, $"{u}/entity-types", May.Read),
            new("create type", Post, $"{u}/entity-types", May.Edit, Json(new EntityTypeRequest("Relic", null, null, null, null))),
            new("edit type", Put, $"{u}/entity-types/{w.CharacterType}", May.Edit, Json(new EntityTypeRequest("Person", null, null, null, null))),
            new("delete type", Delete, $"{u}/entity-types/{any}", May.Edit),
            new("move type", Post, $"{u}/entity-types/{w.CharacterType}/move", May.Edit, Json(new EntityTypeMoveRequest("down"))),
            new("reorder type", Post, $"{u}/entity-types/{w.CharacterType}/reorder", May.Edit, Json(new EntityTypeReorderRequest(0, null))),
            new("add field", Post, $"{u}/entity-types/{w.CharacterType}/fields", May.Edit, Json(new FieldDefinitionRequest("Motto", EntityFieldKind.ShortText, false, null, null, null))),
            new("edit field", Put, $"{u}/entity-types/{w.CharacterType}/fields/{any}", May.Edit, Json(new FieldDefinitionRequest("Motto", EntityFieldKind.ShortText, false, null, null, null))),
            new("delete field", Delete, $"{u}/entity-types/{w.CharacterType}/fields/{any}", May.Edit),

            new("image original", Get, $"{e}/image/{w.Image.AssetId}/original", May.Read),
            new("image thumbnail", Get, $"{e}/image/{w.Image.AssetId}/thumbnail/{w.Image.ThumbnailId}", May.Read),
            new("upload image", Put, $"{e}/image", May.Edit, PngForm),
            new("reframe image", Put, $"{e}/image/thumbnail", May.Edit, Json(new EntityThumbnailRequest(w.Image.AssetId, null))),
            new("remove image", Delete, $"{e}/image", May.Edit),

            new("article", Get, $"{e}/article", May.Read),
            new("save article", Put, $"{e}/article", May.Edit, Json(new EntityArticleRequest(ArticleTestClient.Doc("Changed."), null))),
            new("article history", Get, $"{e}/article/revisions", May.Edit),
            new("article version", Get, $"{e}/article/revisions/{w.ArticleRevision}", May.Edit),
            new("restore article version", Post, $"{e}/article/revisions/{w.ArticleRevision}/restore", May.Edit, Json(new EntityArticleRestoreRequest(null))),

            new("entry history", Get, $"{e}/revisions", May.Edit),
            new("entry version", Get, $"{e}/revisions/{w.EntryRevision}", May.Edit),
            new("restore entry version", Post, $"{e}/revisions/{w.EntryRevision}/restore", May.Edit),

            // ---------- Relationships, family, timeline, chronology ----------
            new("entry relationships", Get, $"{e}/relationships", May.Read),
            new("relationship", Get, $"{u}/relationships/{w.Relationship}", May.Read),
            new("create relationship", Post, $"{u}/relationships", May.Edit, Json(new RelationshipRequest(w.Kind, w.Other, w.Entry, CanonStatus.Canon, null, null, null))),
            new("edit relationship", Put, $"{u}/relationships/{w.Relationship}", May.Edit, Json(new RelationshipRequest(w.Kind, w.Entry, w.Other, CanonStatus.Canon, null, null, "Edited"))),
            new("delete relationship", Delete, $"{u}/relationships/{w.Relationship}", May.Edit),
            new("relation kinds", Get, $"{u}/relationship-types", May.Read),
            new("create kind", Post, $"{u}/relationship-types", May.Edit, Json(new RelationshipTypeRequest("Rival of", null, true, null, null))),
            new("edit kind", Put, $"{u}/relationship-types/{w.Kind}", May.Edit, Json(new RelationshipTypeRequest("Bound to", null, true, null, null))),
            new("delete kind", Delete, $"{u}/relationship-types/{any}", May.Edit),
            new("family tree", Get, $"{u}/family-tree/{w.Entry}", May.Read),
            new("family discovery", Get, $"{u}/family-tree/families", May.Read),

            new("timeline", Get, $"{u}/timeline", May.Read),
            new("timeline items", Get, $"{u}/timeline/items", May.Read),
            new("moment", Get, $"{u}/timeline/{w.Moment}", May.Read),
            new("create moment", Post, $"{u}/timeline", May.Edit, Json(RuleValidationTestClient.Moment("Another flood", null))),
            new("edit moment", Put, $"{u}/timeline/{w.Moment}", May.Edit, Json(RuleValidationTestClient.Moment("The great flood", null))),
            new("delete moment", Delete, $"{u}/timeline/{w.Moment}", May.Edit),
            new("chronology", Get, $"{u}/chronology", May.Read),
            new("edit chronology", Put, $"{u}/chronology", May.Edit, Json(new ChronologyRequest([new ChronologyEraRequest(null, "Age of Ash", "AA", ChronologyEraDirection.Ascending, ChronologyLabelPosition.BeforeYear)]))),
            new("save calendar", Put, $"{u}/chronology/calendar", May.Edit, Json(new ChronologyCalendarRequest([new ChronologyCalendarMonthRequest(null, "Frostwane", null, 42)]))),
            new("remove calendar", Delete, $"{u}/chronology/calendar", May.Edit),

            // ---------- World rules, validation, Canon, search ----------
            new("world rules", Get, $"{u}/world-rules", May.Read),
            new("world rule", Get, $"{u}/world-rules/{w.Rule}", May.Read),
            new("create rule", Post, $"{u}/world-rules", May.Edit, Json(new WorldRuleRequest("Salt binds", null, null))),
            new("edit rule", Put, $"{u}/world-rules/{w.Rule}", May.Edit, Json(new WorldRuleRequest("Tides keep count", "Edited", null))),
            new("trash rule", Delete, $"{u}/world-rules/{w.Rule}", May.Edit),
            new("validation terms", Get, $"{u}/validation-terms", May.Read),
            new("create term", Post, $"{u}/validation-terms", May.Edit, Json(new ValidationTermRequest(ValidationTermKind.EventKind, "Abdication"))),
            new("rename term", Put, $"{u}/validation-terms/{w.Term}", May.Edit, Json(new ValidationTermRenameRequest("Crowning"))),
            new("delete term", Delete, $"{u}/validation-terms/{w.Term}", May.Edit),
            new("canon findings", Get, $"{u}/canon-conflicts", May.Read),
            new("canon finding", Get, $"{u}/canon-conflicts/{any}", May.Read),
            new("evaluate canon", Post, $"{u}/canon-conflicts/evaluate", May.Edit),
            new("dismiss finding", Post, $"{u}/canon-conflicts/{any}/dismiss", May.Edit),
            new("reopen finding", Post, $"{u}/canon-conflicts/{any}/reopen", May.Edit),
            new("search", Get, $"{u}/search?q=Ember", May.Read),

            // ---------- Stories ----------
            new("stories", Get, $"{u}/stories", May.Read),
            new("story", Get, s, May.Read),
            new("create story", Post, $"{u}/stories", May.Edit, Json(new StoryRequest("Second book", null, StoryStatus.Planning))),
            new("edit story", Put, s, May.Edit, Json(new StoryRequest("The drowned heir", "Edited", StoryStatus.Drafting))),
            new("trash story", Delete, s, May.Edit),
            new("chapters", Get, $"{s}/chapters", May.Read),
            new("chapter", Get, $"{s}/chapters/{w.Chapter}", May.Read),
            new("create chapter", Post, $"{s}/chapters", May.Edit, Json(new ChapterRequest("High water", null, null))),
            new("order chapters", Put, $"{s}/chapters/order", May.Edit, Json(new ChapterOrderRequest([w.Chapter]))),
            new("edit chapter", Put, $"{s}/chapters/{w.Chapter}", May.Edit, Json(new ChapterRequest("Low tide", null, null))),
            new("trash chapter", Delete, $"{s}/chapters/{w.Chapter}", May.Edit),
            new("scenes", Get, $"{s}/scenes", May.Read),
            new("scene", Get, scene, May.Read),
            new("create scene", Post, $"{s}/scenes", May.Edit, Json(new SceneRequest("The gate", null, null, null, null, null))),
            new("order scenes", Put, $"{s}/scenes/order", May.Edit, Json(new SceneOrderRequest([w.Scene], w.Chapter))),
            new("edit scene", Put, scene, May.Edit, Json(new SceneRequest("The causeway", "Edited", null, null, null, null, w.Chapter))),
            new("move scene", Put, $"{scene}/position", May.Edit, Json(new ScenePositionRequest(null, 0))),
            new("trash scene", Delete, scene, May.Edit),
            new("manuscript", Get, $"{scene}/manuscript", May.Read),
            new("save manuscript", Put, $"{scene}/manuscript", May.Edit, Json(new SceneManuscriptRequest("Edited prose.", null))),
            new("manuscript history", Get, $"{scene}/manuscript/revisions", May.Edit),
            new("manuscript version", Get, $"{scene}/manuscript/revisions/{w.ManuscriptRevision}", May.Edit),
            new("restore manuscript version", Post, $"{scene}/manuscript/revisions/{w.ManuscriptRevision}/restore", May.Edit, Json(new SceneManuscriptRestoreRequest(null))),
            new("arcs", Get, $"{s}/plot-arcs", May.Read),
            new("arc", Get, $"{s}/plot-arcs/{w.Arc}", May.Read),
            new("create arc", Post, $"{s}/plot-arcs", May.Edit, Json(new PlotArcRequest("Revenge", null, null))),
            new("order arcs", Put, $"{s}/plot-arcs/order", May.Edit, Json(new PlotArcOrderRequest([w.Arc]))),
            new("edit arc", Put, $"{s}/plot-arcs/{w.Arc}", May.Edit, Json(new PlotArcRequest("Inheritance", "Edited", null))),
            new("trash arc", Delete, $"{s}/plot-arcs/{w.Arc}", May.Edit),
            new("beat", Get, $"{s}/plot-beats/{w.Beat}", May.Read),
            new("create beat", Post, $"{s}/plot-arcs/{w.Arc}/beats", May.Edit, Json(new PlotBeatRequest("The heir returns", null, null, null, null))),
            new("order beats", Put, $"{s}/plot-arcs/{w.Arc}/beats/order", May.Edit, Json(new PlotBeatOrderRequest([w.Beat]))),
            new("edit beat", Put, $"{s}/plot-beats/{w.Beat}", May.Edit, Json(new PlotBeatRequest("The will is read", "Edited", null, null, null))),
            new("trash beat", Delete, $"{s}/plot-beats/{w.Beat}", May.Edit),

            // ---------- Trash ----------
            new("trash", Get, t, May.Edit),
            new("restore entry", Post, $"{t}/{w.Trash.Entry}/restore", May.Edit),
            new("restore story", Post, $"{t}/stories/{w.Trash.Story}/restore", May.Edit),
            new("restore chapter", Post, $"{t}/chapters/{w.Trash.Chapter}/restore", May.Edit),
            new("restore scene", Post, $"{t}/scenes/{w.Trash.Scene}/restore", May.Edit),
            new("restore arc", Post, $"{t}/plot-arcs/{w.Trash.Arc}/restore", May.Edit),
            new("restore beat", Post, $"{t}/plot-beats/{w.Trash.Beat}/restore", May.Edit),
            new("restore rule", Post, $"{t}/world-rules/{w.Trash.Rule}/restore", May.Edit),
            new("erase entry", Delete, $"{t}/{w.Trash.Entry}", May.Own),
            new("erase story", Delete, $"{t}/stories/{w.Trash.Story}", May.Own),
            new("erase chapter", Delete, $"{t}/chapters/{w.Trash.Chapter}", May.Own),
            new("erase scene", Delete, $"{t}/scenes/{w.Trash.Scene}", May.Own),
            new("erase arc", Delete, $"{t}/plot-arcs/{w.Trash.Arc}", May.Own),
            new("erase beat", Delete, $"{t}/plot-beats/{w.Trash.Beat}", May.Own),
            new("erase rule", Delete, $"{t}/world-rules/{w.Trash.Rule}", May.Own),
            new("erase in bulk", Post, $"{t}/bulk-delete", May.Own, Json(new BulkTrashDeleteRequest(
            [
                new TrashSelection(TrashItemKind.Entry, w.Trash.Entry),
                new TrashSelection(TrashItemKind.Story, w.Trash.Story),
                new TrashSelection(TrashItemKind.WorldRule, w.Trash.Rule),
            ]))),

            // ---------- Publishing ----------
            new("publication", Get, $"{u}/publication", May.Own),
            new("save publication", Put, $"{u}/publication", May.Own, Json(new PublicationDetailsRequest("A drowned coast.", null, null))),
            new("publish universe", Post, $"{u}/publish", May.Own),
            new("unpublish universe", Post, $"{u}/unpublish", May.Own),
            new("entry publication", Get, $"{e}/publication", May.Own),
            new("publish entry", Post, $"{e}/publish", May.Own),
            new("unpublish entry", Post, $"{e}/unpublish", May.Own),
            new("story publication", Get, $"{s}/publication", May.Own),
            new("save story publication", Put, $"{s}/publication", May.Own, Json(new StoryPublicationRequest("A summary."))),
            new("publish story", Post, $"{s}/publish", May.Own),
            new("unpublish story", Post, $"{s}/unpublish", May.Own),
            new("publish scene", Post, $"{scene}/publish", May.Own),
            new("unpublish scene", Post, $"{scene}/unpublish", May.Own),
            new("publish manuscript", Post, $"{scene}/manuscript/publish", May.Own),
            new("unpublish manuscript", Post, $"{scene}/manuscript/unpublish", May.Own),
            new("publish arc", Post, $"{s}/plot-arcs/{w.Arc}/publish", May.Own),
            new("unpublish arc", Post, $"{s}/plot-arcs/{w.Arc}/unpublish", May.Own),
            new("artwork", Get, $"{u}/artwork", May.Own),
            new("upload artwork", Put, $"{u}/artwork", May.Own, PngForm),
            new("reframe artwork", Put, $"{u}/artwork/card", May.Own, Json(new UniverseArtworkCardRequest(any, null))),
            new("remove artwork", Delete, $"{u}/artwork", May.Own),
            new("artwork original", Get, $"{u}/artwork/{any}/original", May.Own),
            new("artwork card", Get, $"{u}/artwork/{any}/card/{any}", May.Own),

            // ---------- Backup ----------
            new("export", Get, $"{u}/export", May.Own),

            // ---------- Review comments (043) ----------
            new("entry comments", Get, $"{e}/comments", May.Read),
            new("comment on entry", Post, $"{e}/comments", May.Comment, Json(new CommentRequest("A note."))),
            new("story comments", Get, $"{s}/comments", May.Read),
            new("comment on story", Post, $"{s}/comments", May.Comment, Json(new CommentRequest("A note."))),
            new("scene comments", Get, $"{scene}/comments", May.Read),
            new("comment on scene", Post, $"{scene}/comments", May.Comment, Json(new CommentRequest("A note."))),
            new("reply to thread", Post, $"{u}/comment-threads/{any}/replies", May.Comment, Json(new CommentRequest("A reply."))),
            new("resolve thread", Post, $"{u}/comment-threads/{any}/resolve", May.Edit),
            new("reopen thread", Post, $"{u}/comment-threads/{any}/reopen", May.Edit),

            // ---------- Collaborators (030) ----------
            new("collaborators", Get, $"{u}/collaborators", May.Own),
            new("change collaborator role", Put, $"{u}/collaborators/{w.EditorId}", May.Own, Json(new CollaboratorRoleRequest(UniverseRole.Viewer))),
            new("remove collaborator", Delete, $"{u}/collaborators/{w.ViewerId}", May.Own),
            new("invite", Post, $"{u}/invitations", May.Own, Json(new InvitationRequest("someone-new@example.test", UniverseRole.Editor))),
            new("change invitation role", Put, $"{u}/invitations/{any}", May.Own, Json(new CollaboratorRoleRequest(UniverseRole.Viewer))),
            new("revoke invitation", Delete, $"{u}/invitations/{any}", May.Own),
        ];
    }

    private static bool Allowed(May may, Who who) => may switch
    {
        May.Read => who is Who.Owner or Who.Editor or Who.Reviewer or Who.Viewer,
        May.Comment => who is Who.Owner or Who.Editor or Who.Reviewer,
        May.Edit => who is Who.Owner or Who.Editor,
        _ => who is Who.Owner,
    };

    [Fact]
    public async Task Every_member_lacking_a_capability_is_refused_with_403_and_nothing_changes()
    {
        var w = await NewSharedWorld(_factory, "matrixdeny");
        var before = await Fingerprint(w);
        var refused = 0;

        foreach (var call in Catalog(w))
        {
            foreach (var who in new[] { Who.Editor, Who.Reviewer, Who.Viewer })
            {
                if (Allowed(call.May, who))
                {
                    continue;
                }

                await AssertDenied(await w.Client(who).SendAsync(call.Request(call.Path)), $"{who}: {call.Name}");
                refused++;
            }
        }

        // 64 Edit routes refused to two roles, 39 owner-only routes to three; the count catches a catalog that silently shrank.
        Assert.True(refused > 150, $"Only {refused} refusals were exercised.");
        Assert.Equal(before, await Fingerprint(w));
    }

    [Fact]
    public async Task An_outsider_gets_the_same_404_as_a_universe_that_does_not_exist_on_every_route()
    {
        var w = await NewSharedWorld(_factory, "matrixout");
        var before = await Fingerprint(w);
        var missing = $"/api/universes/{Guid.NewGuid()}";

        foreach (var call in Catalog(w))
        {
            var foreign = await w.Outsider.SendAsync(call.Request(call.Path));
            var nowhere = await w.Outsider.SendAsync(call.Request(call.Path.Replace($"/api/universes/{w.U}", missing, StringComparison.Ordinal)));

            await AssertHidden(foreign, $"outsider: {call.Name}");
            await AssertHidden(nowhere, $"missing: {call.Name}");
            Assert.Equal(await nowhere.Content.ReadAsStringAsync(), await foreign.Content.ReadAsStringAsync());
        }

        Assert.Equal(before, await Fingerprint(w));
    }

    [Fact]
    public async Task Every_member_reads_the_live_universe_and_only_editors_read_history_and_trash()
    {
        var w = await NewSharedWorld(_factory, "matrixread");

        foreach (var call in Catalog(w).Where(call => call.Method == HttpMethod.Get && call.May != May.Own))
        {
            foreach (var who in Members.Where(who => Allowed(call.May, who)))
            {
                var response = await w.Client(who).SendAsync(call.Request(call.Path));

                // A finding id is random: past the gate, a member is told it is not there - the same as the owner is.
                var expected = call.Name == "canon finding" ? HttpStatusCode.NotFound : HttpStatusCode.OK;
                Assert.True(response.StatusCode == expected, $"{who}: {call.Name} answered {(int)response.StatusCode}");
            }
        }
    }

    [Fact]
    public async Task Every_universe_route_is_in_the_catalog()
    {
        var w = await NewSharedWorld(_factory, "matrixall");
        // Every route template under a universe, as it is registered: the catalog must name at least as many.
        var registered = new HashSet<string>();
        var dataSource = _factory.Services.GetServices<Microsoft.AspNetCore.Routing.EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>();
        foreach (var endpoint in dataSource)
        {
            var template = endpoint.RoutePattern.RawText ?? "";
            if (!template.StartsWith("/api/universes/{", StringComparison.Ordinal))
            {
                continue;
            }

            var methods = endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Routing.IHttpMethodMetadata>()?.HttpMethods ?? [];
            foreach (var method in methods)
            {
                registered.Add($"{method} {Normalize(template)}");
            }
        }

        var catalogued = Catalog(w)
            .Select(call => $"{call.Method.Method} {Normalize(Shape(call.Path))}")
            .ToHashSet();

        Assert.True(registered.Count > 140, $"Only {registered.Count} universe routes were found registered.");
        Assert.Empty(registered.Except(catalogued).Order());
    }

    // ---------- Reading the result ----------

    /// <summary>A path with its ids replaced by a placeholder, as a route template is once its parameter names are.</summary>
    private static string Shape(string path)
    {
        var withoutQuery = path.Split('?')[0];
        return string.Join('/', withoutQuery.Split('/').Select(part => Guid.TryParse(part, out _) ? "{}" : part));
    }

    private static string Normalize(string template) =>
        System.Text.RegularExpressions.Regex.Replace(template.TrimEnd('/'), @"\{[^}]*\}", "{}");

    /// <summary>What a refused request could have changed, read straight from the database.</summary>
    private async Task<string> Fingerprint(SharedWorld w)
    {
        var parts = new List<object?>();
        await WithDb(_factory, async db =>
        {
            var u = w.U;
            var universe = await db.Universes.AsNoTracking().SingleAsync(row => row.Id == u);
            parts.AddRange([universe.Name, universe.Description, universe.AccentColor, universe.IsArchived, universe.Visibility,
                universe.PublicSummary, universe.UpdatedAt]);
            parts.Add(await db.Entities.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.Entities.CountAsync(row => row.UniverseId == u && row.DeletedAt != null));
            parts.Add(await db.Entities.Where(row => row.UniverseId == u).MaxAsync(row => row.UpdatedAt));
            parts.Add(await db.Entities.CountAsync(row => row.UniverseId == u && row.Visibility != ContentVisibility.Private));
            parts.Add(await db.EntityTypes.CountAsync(row => row.UniverseId == u));
            parts.Add(string.Join(",", await db.EntityTypes.Where(row => row.UniverseId == u).OrderBy(row => row.Id).Select(row => row.Name + row.DisplayOrder).ToListAsync()));
            parts.Add(await db.EntityFieldDefinitions.CountAsync(row => row.EntityType!.UniverseId == u));
            parts.Add(await db.EntityImages.CountAsync(row => row.Entity!.UniverseId == u));
            parts.Add(await db.EntityArticleRevisions.CountAsync(row => row.Entity!.UniverseId == u));
            parts.Add(await db.EntityRevisions.CountAsync(row => row.Entity!.UniverseId == u));
            parts.Add(await db.Relationships.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.RelationshipTypes.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.TimelineEntries.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.ChronologyEras.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.WorldRules.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.WorldRules.CountAsync(row => row.UniverseId == u && row.DeletedAt != null));
            parts.Add(await db.ValidationTerms.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.CanonConflicts.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.Stories.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.Stories.CountAsync(row => row.UniverseId == u && row.DeletedAt != null));
            parts.Add(await db.Stories.CountAsync(row => row.UniverseId == u && row.Visibility != ContentVisibility.Private));
            parts.Add(await db.Chapters.CountAsync(row => row.Story!.UniverseId == u && row.DeletedAt == null));
            parts.Add(await db.Scenes.CountAsync(row => row.Story!.UniverseId == u && row.DeletedAt == null));
            parts.Add(await db.SceneManuscriptRevisions.CountAsync(row => row.Scene!.Story!.UniverseId == u));
            parts.Add(await db.PlotArcs.CountAsync(row => row.Story!.UniverseId == u && row.DeletedAt == null));
            parts.Add(await db.PlotBeats.CountAsync(row => row.PlotArc!.Story!.UniverseId == u && row.DeletedAt == null));
            parts.Add(await db.UniverseArtworks.CountAsync(row => row.UniverseId == u));
            parts.Add(await db.UniverseMemberships.CountAsync(row => row.UniverseId == u));
            var threads = db.CommentThreads.Where(row => row.Entity!.UniverseId == u || row.Story!.UniverseId == u || row.Scene!.Story!.UniverseId == u);
            parts.Add(await threads.CountAsync());
            parts.Add(await threads.CountAsync(row => row.ResolvedAt != null));
            parts.Add(await threads.SelectMany(row => row.Comments).CountAsync());
        });

        return string.Join("|", parts);
    }
}
