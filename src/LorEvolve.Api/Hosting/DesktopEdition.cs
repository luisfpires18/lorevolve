namespace LorEvolve.Api.Hosting;

/// <summary>
/// The desktop edition (ADR 0070): the same host run by the desktop shell on the buyer's own machine, under the
/// environment named <c>Desktop</c>. One local account, plain HTTP on loopback, none of the web-only surfaces.
/// </summary>
public static class DesktopEdition
{
    public const string EnvironmentName = "Desktop";

    public static bool IsDesktop(this IHostEnvironment environment) => environment.IsEnvironment(EnvironmentName);

    /// <summary>
    /// The hosts that deliberately run plain HTTP: development, the test host and the desktop app's loopback server.
    /// Every deployed web environment is HTTPS, so it is a host that has to opt out of HTTPS, never the other way round.
    /// </summary>
    public static bool ServesPlainHttp(this IHostEnvironment environment) =>
        environment.IsDevelopment() || environment.IsEnvironment("Testing") || environment.IsDesktop();
}
