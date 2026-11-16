using System.Text.Json;
using System.Text.Json.Serialization;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Universes;
using ModelContextProtocol.Protocol;

namespace LorEvolve.Api.Features.Mcp;

/// <summary>
/// What every MCP tool class returns and refuses with, written once: a result is JSON text, an error is
/// <c>{ error, message, details? }</c> flagged as an error. Tool classes call these with <c>using static</c>.
/// </summary>
internal static class McpResults
{
    /// <summary>The default way results are written: plain JSON, enums by name, nothing empty.</summary>
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>A result. A class whose enums read in snake case passes its own options.</summary>
    internal static CallToolResult Result<T>(T value, JsonSerializerOptions? json = null) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(value, json ?? Json) }],
    };

    /// <summary>An error the client can read and act on. <c>details</c> is left out when null.</summary>
    internal static CallToolResult Error(string code, string message, object? details = null) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message, details }, Json) }],
    };

    /// <summary>The refusal for an id with nothing behind it. A class may say what the id was meant to name.</summary>
    internal static CallToolResult NotFound(string message = "Nothing with that id is in this universe.") =>
        Error("not_found", message);

    /// <summary>The reading as a result, or not found when there is none.</summary>
    internal static CallToolResult Found<T>(T? reading, JsonSerializerOptions? json = null) where T : class =>
        reading is null ? NotFound() : Result(reading, json);

    /// <summary>
    /// Refuses when the connection may not read a universe; null when it may. The gate sets the caller before any tool
    /// can run. A tool reached without one - which the gate makes impossible - still reads nothing.
    /// </summary>
    internal static CallToolResult? Guard(McpCaller caller) =>
        caller.IsAllowed ? null : Error("not_allowed", "This connection cannot read a universe.");

    /// <summary>
    /// The person's role now, when it lets them stage anything, exactly as a proposal checks it: the token's scope,
    /// the connection's own permission and the role, read again on every call (ADR 0047). Null otherwise.
    /// </summary>
    internal static async Task<UniverseRole?> RoleAsync(LorEvolveDbContext db, McpCaller caller, CancellationToken cancellationToken)
    {
        if (!caller.IsAllowed || !caller.CanPropose)
        {
            return null;
        }

        var role = await UniverseAccess.RoleAsync(db, caller.UniverseId, caller.UserId, cancellationToken);
        return role is { } effective && AiChangePermissions.MayStageAnything(effective) ? effective : null;
    }
}
