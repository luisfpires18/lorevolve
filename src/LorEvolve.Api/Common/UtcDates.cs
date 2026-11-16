namespace LorEvolve.Api.Common;

internal static class UtcDates
{
    /// <summary>
    /// A stored timestamp as UTC. SQLite hands back an unspecified kind, and a client that reads a local time as
    /// UTC is off by the server's offset; every feature does this at the edge. A kind-less value from a client is
    /// read as UTC, and a local one is converted.
    /// </summary>
    public static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    public static DateTime? Utc(DateTime? value) => value is { } moment ? Utc(moment) : null;
}
