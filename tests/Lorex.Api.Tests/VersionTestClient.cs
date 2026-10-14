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

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
}
