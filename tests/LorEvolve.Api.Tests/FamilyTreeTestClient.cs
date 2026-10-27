using System.Net.Http.Json;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Relationships;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The HTTP steps the family tree tests share (ADR 0035): entries, relation kinds with and without a family meaning, parent
/// links, trees, and the circle Canon reports.
///
/// The kinds here are called "bore" and "raised" on purpose. Nothing reads a kind's name, so the words carry no meaning and the
/// tests would read the same if they were called anything else; what makes a link a parent link is the family meaning its author
/// configured. Not a test.
/// </summary>
internal static class FamilyTreeTestClient
{
    public const string LoopRule = "CANON-FAMILY-001";

    public sealed record Family(HttpClient Client, Guid Universe, Guid Character, Guid Location);

    /// <summary>The household most tests start from: two kinds, three generations, and a sibling with two shared parents.</summary>
    public sealed record Household(
        Family Family,
        RelationshipTypeResponse Bore,
        RelationshipTypeResponse Raised,
        Guid Nana,
        Guid Mara,
        Guid Oren,
        Guid Lia,
        Guid Tam,
        Guid Cai,
        Guid Pip)
    {
        public HttpClient Client => Family.Client;

        public Guid Universe => Family.Universe;
    }

    // ---------- A universe to build a family in ----------

    public static async Task<Family> NewFamily(LorEvolveApiFactory factory, string tag)
    {
        var (client, universe) = await SignedInWithUniverse(factory, tag);
        return await InUniverse(client, universe.Id);
    }

    public static async Task<Family> InUniverse(HttpClient client, Guid universeId)
    {
        var types = (await client.GetFromJsonAsync<List<EntityTypeResponse>>($"/api/universes/{universeId}/entity-types"))!;
        return new Family(
            client,
            universeId,
            types.First(type => type.Name == "Character").Id,
            types.First(type => type.Name == "Location").Id);
    }

    public static async Task<Guid> Person(
        Family family,
        string name,
        CanonStatus canonStatus = CanonStatus.Canon,
        Guid? entityTypeId = null,
        string? summary = null) =>
        (await PostJson<EntityDetail>(
            family.Client,
            $"/api/universes/{family.Universe}/entities",
            new EntityRequest(entityTypeId ?? family.Character, name, summary, canonStatus, null, null, null))).Id;

    public static async Task SetCanonStatus(Family family, Guid entityId, string name, CanonStatus canonStatus) =>
        (await family.Client.PutVersionedAsync(
            $"/api/universes/{family.Universe}/entities/{entityId}",
            new EntityRequest(family.Character, name, null, canonStatus, null, null, null))).EnsureSuccessStatusCode();

    // ---------- Relation kinds ----------

    public static string Kinds(Guid universeId) => $"/api/universes/{universeId}/relationship-types";

    public static Task<HttpResponseMessage> PostKind(HttpClient client, Guid universeId, RelationshipTypeRequest request) =>
        client.PostAsJsonAsync(Kinds(universeId), request);

    public static Task<RelationshipTypeResponse> Kind(
        Family family,
        string name,
        RelationshipFamilySemantic? familySemantic = null,
        string? inverseName = null) =>
        PostJson<RelationshipTypeResponse>(
            family.Client,
            Kinds(family.Universe),
            new RelationshipTypeRequest(name, inverseName ?? $"{name}, the other way", false, null, null, null, familySemantic));

    public static Task<HttpResponseMessage> PutKind(
        Family family,
        RelationshipTypeResponse kind,
        RelationshipFamilySemantic? familySemantic,
        bool? isSymmetric = null,
        string? name = null,
        RelationshipTypeCanonConstraints? constraints = null) =>
        family.Client.PutAsJsonAsync(
            $"{Kinds(family.Universe)}/{kind.Id}",
            new RelationshipTypeRequest(
                name ?? kind.Name,
                kind.InverseName,
                isSymmetric ?? kind.IsSymmetric,
                kind.Description,
                null,
                constraints,
                familySemantic));

    /// <summary>Gives a kind a family meaning, or takes it away, and hands back the kind as it now stands.</summary>
    public static async Task<RelationshipTypeResponse> Configure(
        Family family,
        RelationshipTypeResponse kind,
        RelationshipFamilySemantic? familySemantic)
    {
        var response = await PutKind(family, kind, familySemantic);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<RelationshipTypeResponse>())!;
    }

    public static async Task<List<RelationshipTypeResponse>> ListKinds(Family family) =>
        (await family.Client.GetFromJsonAsync<List<RelationshipTypeResponse>>(Kinds(family.Universe)))!;

    // ---------- Links ----------

    public static async Task<Guid> Link(
        Family family,
        RelationshipTypeResponse kind,
        Guid parent,
        Guid child,
        CanonStatus canonStatus = CanonStatus.Canon) =>
        (await PostJson<RelationshipDetail>(
            family.Client,
            $"/api/universes/{family.Universe}/relationships",
            new RelationshipRequest(kind.Id, parent, child, canonStatus, null, null, null))).Id;

    public static Task<HttpResponseMessage> PostLink(
        Family family,
        Guid kindId,
        Guid parent,
        Guid child,
        CanonStatus canonStatus = CanonStatus.Canon) =>
        family.Client.PostAsJsonAsync(
            $"/api/universes/{family.Universe}/relationships",
            new RelationshipRequest(kindId, parent, child, canonStatus, null, null, null));

    public static async Task Unlink(Family family, Guid relationshipId) =>
        (await family.Client.DeleteAsync($"/api/universes/{family.Universe}/relationships/{relationshipId}"))
            .EnsureSuccessStatusCode();

    public static async Task Trash(Family family, Guid entityId) =>
        (await family.Client.DeleteAsync($"/api/universes/{family.Universe}/entities/{entityId}")).EnsureSuccessStatusCode();

    public static async Task Restore(Family family, Guid entityId) =>
        (await family.Client.PostAsync($"/api/universes/{family.Universe}/trash/{entityId}/restore", null))
            .EnsureSuccessStatusCode();

    // ---------- Trees ----------

    public static string TreeRoute(Guid universeId, Guid entityId) =>
        $"/api/universes/{universeId}/family-tree/{entityId}";

    public static Task<HttpResponseMessage> TreeResponse(HttpClient client, Guid universeId, Guid entityId) =>
        client.GetAsync(TreeRoute(universeId, entityId));

    public static async Task<FamilyTreeResponse> Tree(HttpClient client, Guid universeId, Guid entityId)
    {
        var response = await TreeResponse(client, universeId, entityId);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<FamilyTreeResponse>())!;
    }

    public static Task<FamilyTreeResponse> Tree(Family family, Guid entityId) =>
        Tree(family.Client, family.Universe, entityId);

    public static async Task<string> TreeText(Family family, Guid entityId)
    {
        var response = await TreeResponse(family.Client, family.Universe, entityId);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    /// <summary>The names of a position's relatives, in the order the API put them.</summary>
    public static List<string> Names(FamilyTreeResponse tree, IEnumerable<FamilyTreeRelative> relatives)
    {
        var names = tree.Nodes.ToDictionary(node => node.EntityId, node => node.Name);
        return [.. relatives.Select(relative => names[relative.EntityId])];
    }

    /// <summary>
    /// A tree as what it says, by name: every relative with the kind, meaning and status of each link on each path it was found
    /// through, and every circle. Two trees of the same family under different ids describe identically.
    /// </summary>
    public static List<string> Describe(FamilyTreeResponse tree)
    {
        var names = tree.Nodes.ToDictionary(node => node.EntityId, node => node.Name);
        var links = tree.Links.ToDictionary(link => link.RelationshipId);

        string Step(Guid id)
        {
            var link = links[id];
            return $"{names[link.ParentEntityId]}>{names[link.ChildEntityId]}:{link.Semantic}:{link.CanonStatus}:{link.RelationshipTypeName}";
        }

        string Paths(FamilyTreeRelative relative) =>
            string.Join(" | ", relative.Paths.Select(path => string.Join(" / ", path.Select(Step))).Order(StringComparer.Ordinal));

        var lines = new List<string> { $"focal {names[tree.FocalEntityId]} generations={tree.GenerationsEachWay}" };

        foreach (var (position, relatives) in new (string, IReadOnlyList<FamilyTreeRelative>)[]
        {
            ("parent", tree.Parents),
            ("grandparent", tree.Grandparents),
            ("sibling", tree.Siblings),
            ("child", tree.Children),
            ("grandchild", tree.Grandchildren),
        })
        {
            lines.AddRange(relatives.Select(relative => $"{position} {names[relative.EntityId]} paths=[{Paths(relative)}]"));
        }

        lines.AddRange(tree.Loops.Select(loop =>
            $"circle [{string.Join(", ", loop.EntityIds.Select(id => names[id]))}] " +
            $"links=[{string.Join(" | ", loop.RelationshipIds.Select(Step).Order(StringComparer.Ordinal))}]"));

        return lines;
    }

    // ---------- Canon ----------

    /// <summary>The circle rule's findings in one status - pending by default - or in any status when it is null.</summary>
    public static async Task<List<CanonConflictResponse>> LoopFindings(
        HttpClient client,
        Guid universeId,
        CanonConflictStatus? status = CanonConflictStatus.Pending)
    {
        var filter = status is { } wanted ? $"&status={(int)wanted}" : "";
        var page = (await client.GetFromJsonAsync<CanonConflictPage>(
            $"/api/universes/{universeId}/canon-conflicts?pageSize=100{filter}"))!;
        return [.. page.Items.Where(conflict => conflict.RuleCode == LoopRule)];
    }

    public static Task<List<CanonConflictResponse>> LoopFindings(
        Family family,
        CanonConflictStatus? status = CanonConflictStatus.Pending) =>
        LoopFindings(family.Client, family.Universe, status);

    public static async Task<CanonEvaluationResponse> Evaluate(Family family)
    {
        var response = await family.Client.PostAsync($"/api/universes/{family.Universe}/canon-conflicts/evaluate", null);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<CanonEvaluationResponse>())!;
    }

    // ---------- A household ----------

    /// <summary>
    /// Nana bore Mara; Mara bore Lia and Tam; Oren raised Lia and bore Tam; Lia bore Cai; Cai raised Pip. Every entry and link is
    /// Canon, and the shape is deliberately ordinary: a sibling through two shared parents, one of them adoptive for one child and
    /// biological for the other.
    /// </summary>
    public static async Task<Household> NewHousehold(LorEvolveApiFactory factory, string tag)
    {
        var family = await NewFamily(factory, tag);
        return await Build(family);
    }

    public static async Task<Household> Build(Family family)
    {
        var bore = await Kind(family, "bore", RelationshipFamilySemantic.BiologicalParent, "born to");
        var raised = await Kind(family, "raised", RelationshipFamilySemantic.AdoptiveParent, "raised by");

        var nana = await Person(family, "Nana");
        var mara = await Person(family, "Mara");
        var oren = await Person(family, "Oren");
        var lia = await Person(family, "Lia");
        var tam = await Person(family, "Tam");
        var cai = await Person(family, "Cai");
        var pip = await Person(family, "Pip");

        await Link(family, bore, nana, mara);
        await Link(family, bore, mara, lia);
        await Link(family, raised, oren, lia);
        await Link(family, bore, mara, tam);
        await Link(family, bore, oren, tam);
        await Link(family, bore, lia, cai);
        await Link(family, raised, cai, pip);

        return new Household(family, bore, raised, nana, mara, oren, lia, tam, cai, pip);
    }
}
