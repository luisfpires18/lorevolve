namespace LorEvolve.Api.Hosting;

/// <summary>
/// Refuses a write to <c>/api</c> that a browser says came from another origin (issue #33 follow-up, N-1).
///
/// The session cookie is <c>SameSite=Strict</c>, but "site" is the registrable domain: a page on any
/// <c>*.lorevolve.com</c> (the demo, or a subdomain pointed at a third-party host) is same-site and its requests carry the
/// cookie. JSON bodies already need a CORS preflight, but a plain HTML form can still send a body-less POST
/// (<c>.../publish</c>, <c>.../archive</c>, an invitation's <c>/accept</c>) or a multipart upload (antiforgery is off on
/// those). So every unsafe method on <c>/api</c> must come from this origin:
///
/// - <c>Sec-Fetch-Site</c>, sent by every current browser: only <c>same-origin</c> (or <c>none</c>, typed by the user) passes.
/// - Without it, an <c>Origin</c> header must be this request's own origin or one of <c>Cors:AllowedOrigins</c>.
/// - Neither header: not a browser acting on someone's cookie (tests, scripts), so it passes as before.
///
/// <c>/oauth</c> and <c>/mcp</c> are outside <c>/api</c>: they are called cross-origin by design and carry bearer tokens,
/// not the cookie.
/// </summary>
public static class SameOriginWrites
{
    public const string RefusedCode = "cross_origin_write";

    public static WebApplication UseLorEvolveSameOriginWrites(this WebApplication app, IReadOnlyCollection<string> allowedOrigins)
    {
        app.Use(async (http, next) =>
        {
            if (IsForeignWrite(http.Request, allowedOrigins))
            {
                await Results.Problem(
                    title: "Request refused",
                    detail: "This change has to be made from LorEvolve itself.",
                    statusCode: StatusCodes.Status403Forbidden,
                    extensions: new Dictionary<string, object?> { ["code"] = RefusedCode }).ExecuteAsync(http);
                return;
            }

            await next(http);
        });

        return app;
    }

    public static bool IsForeignWrite(HttpRequest request, IReadOnlyCollection<string> allowedOrigins)
    {
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) || HttpMethods.IsOptions(request.Method)
            || !request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var site = request.Headers["Sec-Fetch-Site"].ToString();
        if (site.Length > 0)
        {
            return site is not ("same-origin" or "none");
        }

        var origin = request.Headers.Origin.ToString();
        if (origin.Length == 0)
        {
            return false;
        }

        var own = $"{request.Scheme}://{request.Host}";
        return !string.Equals(origin, own, StringComparison.OrdinalIgnoreCase)
            && !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
