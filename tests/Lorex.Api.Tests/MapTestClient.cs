using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lorex.Api.Features.Maps;

namespace Lorex.Api.Tests;

/// <summary>Maps over HTTP, as the client sends them (issue #52): the multipart create and replace, and the JSON pins.</summary>
internal static class MapTestClient
{
    public static string Maps(Guid universeId) => $"/api/universes/{universeId}/maps";

    public static string Map(Guid universeId, Guid mapId) => $"{Maps(universeId)}/{mapId}";

    public static string Pins(Guid universeId, Guid mapId) => $"{Map(universeId, mapId)}/pins";

    public static string Pin(Guid universeId, Guid mapId, Guid pinId) => $"{Pins(universeId, mapId)}/{pinId}";

    /// <summary>The create's form: the picture, its name and an optional description.</summary>
    public static MultipartFormDataContent MapForm(string name, byte[] png, string? description = null, string fileName = "world.png", string contentType = "image/png")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);
        form.Add(new StringContent(name), "name");
        if (description is not null)
        {
            form.Add(new StringContent(description), "description");
        }

        return form;
    }

    /// <summary>The replacement's form: the new picture and what happens to the pins.</summary>
    public static MultipartFormDataContent ReplaceForm(byte[] png, string pins, string fileName = "world-2.png")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(png);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", fileName);
        form.Add(new StringContent(pins), "pins");
        return form;
    }

    public static async Task<MapDetail> CreateMap(HttpClient client, Guid universeId, string name, byte[]? png = null, string? description = null)
    {
        var response = await client.PostAsync(Maps(universeId), MapForm(name, png ?? RestoreTestClient.Png(900, 600, 7), description));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<MapDetail>())!;
    }

    public static async Task<MapPinResponse> AddPin(HttpClient client, Guid universeId, Guid mapId, string title, double x, double y, Guid? entityId = null, string? note = null)
    {
        var response = await client.PostAsJsonAsync(Pins(universeId, mapId), new MapPinRequest(title, note, x, y, entityId));
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<MapPinResponse>())!;
    }

    public static async Task<MapDetail> ReadMap(HttpClient client, Guid universeId, Guid mapId) =>
        (await client.GetFromJsonAsync<MapDetail>(Map(universeId, mapId)))!;
}
