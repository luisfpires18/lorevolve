using System.Net;
using System.Text;
using System.Xml;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Publishing;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Seo;

/// <summary>
/// Search and social metadata for the public portal (Task 012, ADR 0038): the app shell with each page's own head,
/// <c>robots.txt</c> and <c>sitemap.xml</c>.
///
/// <para><b>Server-rendered head, client-rendered body.</b> The React app renders every page in the browser, so a crawler
/// or a link preview that does not run JavaScript sees only the HTML the server sends. That HTML is the built
/// <c>index.html</c> with the block between its <c>lorevolve:head</c> markers replaced per request - title, description,
/// robots, canonical, Open Graph - from the same public predicates the public API reads. The body is still the empty
/// shell; the page's content is fetched from <c>/api/public</c> by the app.</para>
///
/// <para><b>Nothing here outlives an unpublish.</b> The head, the sitemap and robots are computed on every request and
/// sent <c>no-cache</c>; nothing is held in the process. The next read after an item goes private no longer names it.</para>
/// </summary>
public static partial class SeoEndpoints
{
    public const string HeadStart = "<!-- lorevolve:head -->";
    public const string HeadEnd = "<!-- /lorevolve:head -->";
    private const string FallbackImage = "/icon-512.png";

    // ponytail: one sitemap file, fine to 50,000 addresses (the protocol's limit); a sitemap index when a portal grows past it.
    private const int SitemapMax = 50_000;

    public static IServiceCollection AddLorEvolveSeo(this IServiceCollection services, IConfiguration configuration) =>
        services.AddSingleton(PublicSite.From(configuration));

    /// <summary>Marks every API response as not a page to index. Authorization, not this header, protects what is private.</summary>
    public static WebApplication UseLorEvolveRobotsHeaders(this WebApplication app)
    {
        app.Use((context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.Headers["X-Robots-Tag"] = "noindex";
            }

            return next(context);
        });
        return app;
    }

    public static IEndpointRouteBuilder MapSeoEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/robots.txt", Robots).AllowAnonymous().ExcludeFromDescription();
        endpoints.MapGet("/sitemap.xml", SitemapAsync).AllowAnonymous().ExcludeFromDescription();
        return endpoints;
    }

    /// <summary>
    /// Invites crawlers to the portal and keeps them out of everything else - or, on a deployment not configured for
    /// indexing, out of everything. <c>/api/public/</c> stays fetchable so a rendering crawler can draw a public page
    /// and a social card can fetch its picture; each API response still says <c>noindex</c> itself.
    /// </summary>
    private static IResult Robots(PublicSite site, HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-cache";

        if (!site.Indexable)
        {
            return Results.Text("User-agent: *\nDisallow: /\n", "text/plain", Encoding.UTF8);
        }

        var text = new StringBuilder()
            .Append("User-agent: *\n")
            .Append("Allow: /explore\n")
            .Append("Allow: /worlds/\n")
            .Append("Allow: /authors/\n")
            .Append("Allow: /api/public/\n")
            .Append("Disallow: /api/\n")
            .Append("Disallow: /app\n")
            .Append("Disallow: /login\n")
            .Append("Disallow: /register\n")
            .Append("Sitemap: ").Append(site.Absolute("/sitemap.xml")).Append('\n')
            .ToString();

        return Results.Text(text, "text/plain", Encoding.UTF8);
    }

    /// <summary>
    /// Every address the portal would have indexed, from the public predicates only: the home page, Explore, each public
    /// universe, each effective-public entry and story, and each author who has a public universe. No id, no workspace
    /// address, no API. Built fresh on every request, so an unpublished item is gone from the next one. 404 on a
    /// deployment not configured for indexing.
    /// </summary>
    private static async Task<IResult> SitemapAsync(PublicSite site, LorEvolveDbContext db, HttpContext context, CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-cache";

        if (!site.Indexable)
        {
            return Results.NotFound();
        }

        var worlds = await PublicationRules.Public(db).AsNoTracking()
            .OrderBy(universe => universe.PublicSlug)
            .Select(universe => universe.PublicSlug!)
            .Take(SitemapMax)
            .ToListAsync(cancellationToken);

        var lore = await PublicationRules.PublicLore(db).AsNoTracking()
            .OrderBy(entity => entity.Universe!.PublicSlug).ThenBy(entity => entity.PublicSlug)
            .Select(entity => new { World = entity.Universe!.PublicSlug!, Slug = entity.PublicSlug! })
            .Take(SitemapMax)
            .ToListAsync(cancellationToken);

        var stories = await PublicationRules.PublicStories(db).AsNoTracking()
            .OrderBy(story => story.Universe!.PublicSlug).ThenBy(story => story.PublicSlug)
            .Select(story => new { World = story.Universe!.PublicSlug!, Slug = story.PublicSlug! })
            .Take(SitemapMax)
            .ToListAsync(cancellationToken);

        var authors = await PublicationRules.Public(db).AsNoTracking()
            .Select(universe => universe.Owner!.PublicAuthorSlug!)
            .Distinct()
            .OrderBy(slug => slug)
            .Take(SitemapMax)
            .ToListAsync(cancellationToken);

        IEnumerable<string> paths =
        [
            "/",
            "/explore",
            .. worlds.Select(slug => $"/worlds/{slug}"),
            .. lore.Select(entry => $"/worlds/{entry.World}/lore/{entry.Slug}"),
            .. stories.Select(story => $"/worlds/{story.World}/stories/{story.Slug}"),
            .. authors.Select(slug => $"/authors/{slug}"),
        ];

        var buffer = new StringBuilder();
        using (var writer = XmlWriter.Create(buffer, new XmlWriterSettings { Indent = true, OmitXmlDeclaration = false }))
        {
            writer.WriteStartDocument();
            writer.WriteStartElement("urlset", "http://www.sitemaps.org/schemas/sitemap/0.9");
            foreach (var path in paths.Take(SitemapMax))
            {
                writer.WriteStartElement("url");
                writer.WriteElementString("loc", site.Absolute(path));
                writer.WriteEndElement();
            }

            writer.WriteEndElement();
            writer.WriteEndDocument();
        }

        // StringBuilder output declares UTF-16; the response is UTF-8, and says so.
        var xml = buffer.ToString().Replace("encoding=\"utf-16\"", "encoding=\"utf-8\"", StringComparison.Ordinal);
        return Results.Text(xml, "application/xml", Encoding.UTF8);
    }

    /// <summary>
    /// The app shell for an address no API route or file claimed, with that page's head written in. A metadata lookup
    /// that fails serves the private head rather than failing the shell: the app itself can still load and say what went
    /// wrong.
    /// </summary>
    public static async Task RenderShellAsync(HttpContext context, ShellTemplate template)
    {
        var site = context.RequestServices.GetRequiredService<PublicSite>();
        var db = context.RequestServices.GetRequiredService<LorEvolveDbContext>();

        PageMetadata page;
        try
        {
            page = await PageMetadataResolver.ResolveAsync(context.Request.Path, context.Request.QueryString, db, context.RequestAborted);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            LogMetadataFailure(context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("LorEvolve.Seo"), exception);
            page = PageMetadataResolver.Private;
        }

        var robots = RobotsValue(page, site);
        context.Response.StatusCode = page.StatusCode;
        context.Response.ContentType = "text/html; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache";
        if (robots.StartsWith("noindex", StringComparison.Ordinal))
        {
            context.Response.Headers["X-Robots-Tag"] = robots;
        }

        await context.Response.WriteAsync(template.Render(Head(page, site, robots)), context.RequestAborted);
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Page metadata could not be read; serving the generic head.")]
    private static partial void LogMetadataFailure(ILogger logger, Exception exception);

    internal static string RobotsValue(PageMetadata page, PublicSite site) =>
        page.Indexable && site.Indexable ? "index,follow"
        : page.FollowLinks && site.Indexable ? "noindex,follow"
        : "noindex,nofollow";

    /// <summary>The head block. Every authored string is HTML-encoded; every absolute URL is built on the configured origin.</summary>
    internal static string Head(PageMetadata page, PublicSite site, string robots)
    {
        var html = new StringBuilder();
        void Meta(string attribute, string key, string? value)
        {
            if (value is not null)
            {
                html.Append("<meta ").Append(attribute).Append("=\"").Append(key).Append("\" content=\"")
                    .Append(WebUtility.HtmlEncode(value)).Append("\" />\n    ");
            }
        }

        html.Append("<title>").Append(WebUtility.HtmlEncode(page.Title)).Append("</title>\n    ");
        Meta("name", "description", page.Description);
        Meta("name", "robots", robots);

        var canonical = page.CanonicalPath is null ? null : site.Absolute(page.CanonicalPath);
        if (canonical is not null)
        {
            html.Append("<link rel=\"canonical\" href=\"").Append(WebUtility.HtmlEncode(canonical)).Append("\" />\n    ");
        }

        // Open Graph only for a page that is public: a private or missing address has nothing to preview.
        if (page.CanonicalPath is not null)
        {
            var image = site.Absolute(page.ImagePath ?? FallbackImage);
            Meta("property", "og:site_name", PageMetadataResolver.Brand);
            Meta("property", "og:type", page.OgType);
            Meta("property", "og:title", page.Title);
            Meta("property", "og:description", page.Description);
            Meta("property", "og:url", canonical);
            Meta("property", "og:image", image);
            Meta("name", "twitter:card", image is not null && page.LargeImage ? "summary_large_image" : "summary");
        }

        return html.ToString().TrimEnd();
    }
}

/// <summary>
/// The built <c>index.html</c>, read once and split at its head markers. The file only changes with a deployment, which
/// restarts the process. A template without the markers is served as it is, with nothing injected.
/// </summary>
public sealed class ShellTemplate
{
    private readonly string _before;
    private readonly string _after;
    private readonly bool _hasMarkers;

    public ShellTemplate(string html)
    {
        var start = html.IndexOf(SeoEndpoints.HeadStart, StringComparison.Ordinal);
        var end = html.IndexOf(SeoEndpoints.HeadEnd, StringComparison.Ordinal);
        _hasMarkers = start >= 0 && end > start;
        _before = _hasMarkers ? html[..(start + SeoEndpoints.HeadStart.Length)] : html;
        _after = _hasMarkers ? html[end..] : string.Empty;
    }

    public bool HasMarkers => _hasMarkers;

    public string Render(string head) => _hasMarkers ? $"{_before}\n    {head}\n    {_after}" : _before;
}
