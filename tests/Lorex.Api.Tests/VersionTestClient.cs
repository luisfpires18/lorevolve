using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Lorex.Api.Features.Lore;

namespace Lorex.Api.Tests;

/// <summary>
/// The edit version a protected save names (ADR 0043), read the way an editor opening the content would. Not a test.
/// </summary>
internal static class VersionTestClient
{
    /// <summary>The <c>version</c> an entry, story or scene reads with now, at its own address.</summary>
    public static async Task<int> CurrentVersion(HttpClient client, string path)
    {
        using var document = JsonDocument.Parse(await client.GetStringAsync(path));
        return document.RootElement.GetProperty("version").GetInt32();
    }

    /// <summary>Puts an entry's older version back over the entry as it stands now.</summary>
    public static async Task<HttpResponseMessage> RestoreEntryVersion(HttpClient client, string entityPath, Guid revisionId) =>
        await client.PostAsJsonAsync(
            $"{entityPath}/revisions/{revisionId}/restore",
            new EntityRevisionRestoreRequest(await CurrentVersion(client, entityPath)));

    /// <summary>
    /// Saves an entry, story or scene the way an editor that has just opened it does: naming the version it reads with now,
    /// unless the body already names one. A caller that cannot read it - an outsider - sends the body as it is, to be
    /// refused exactly as before.
    /// </summary>
    public static async Task<HttpResponseMessage> PutVersionedAsync(this HttpClient client, string path, object body)
    {
        var json = JsonSerializer.SerializeToNode(body, JsonOptions)!.AsObject();
        var read = await client.GetAsync(path);
        if (read.IsSuccessStatusCode && json["expectedVersion"] is null)
        {
            using var document = JsonDocument.Parse(await read.Content.ReadAsStringAsync());
            json["expectedVersion"] = document.RootElement.GetProperty("version").GetInt32();
        }

        return await client.PutAsJsonAsync(path, json);
    }

    /// <summary>The <c>version</c> a field definition reads with now in its type's list, active or archived; null when unread.</summary>
    public static async Task<int?> FieldVersion(HttpClient client, Guid universeId, Guid typeId, Guid fieldId)
    {
        var read = await client.GetAsync($"/api/universes/{universeId}/entity-types");
        if (!read.IsSuccessStatusCode)
        {
            return null;
        }

        var type = (await read.Content.ReadFromJsonAsync<List<EntityTypeResponse>>())!.FirstOrDefault(one => one.Id == typeId);
        return type?.Fields.Concat(type.ArchivedFields ?? []).FirstOrDefault(field => field.Id == fieldId)?.Version;
    }

    /// <summary>
    /// Edits a field definition the way the field drawer does: naming the version it reads with now (ADR 0043 amendment, Issue
    /// #39), unless the request already names one. A caller that cannot read it sends the request as it is, to be refused as before.
    /// </summary>
    public static async Task<HttpResponseMessage> PutFieldAsync(
        this HttpClient client,
        Guid universeId,
        Guid typeId,
        Guid fieldId,
        FieldDefinitionRequest request) =>
        await client.PutAsJsonAsync(
            $"/api/universes/{universeId}/entity-types/{typeId}/fields/{fieldId}",
            request.ExpectedVersion is null
                ? request with { ExpectedVersion = await FieldVersion(client, universeId, typeId, fieldId) }
                : request);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}
