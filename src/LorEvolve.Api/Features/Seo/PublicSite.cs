namespace LorEvolve.Api.Features.Seo;

/// <summary>
/// Where this deployment's public portal lives, and whether search engines are invited to it (Task 012, ADR 0038).
///
/// <para><b>Configured, never guessed.</b> <c>PublicSite:Origin</c> is the one trusted origin every absolute URL - the
/// canonical link, <c>og:url</c>, <c>og:image</c>, the sitemap - is built from. The request's <c>Host</c> header is
/// never read for this: <c>AllowedHosts</c> is <c>*</c>, so a forged header would otherwise write an attacker's origin
/// into a page a crawler or a cache keeps. Unset, no absolute URL is emitted at all.</para>
///
/// <para><b>Indexing is opt-in.</b> <c>PublicSite:AllowIndexing</c> defaults to false, so a deployment nobody
/// configured - DEV included - tells crawlers to stay out (<c>robots.txt</c> disallows everything, every page says
/// <c>noindex</c>, there is no sitemap). A production deployment sets both, in configuration rather than in code.</para>
/// </summary>
public sealed class PublicSite
{
    public const string SectionName = "PublicSite";

    private PublicSite(Uri? origin, bool allowIndexing)
    {
        Origin = origin;
        AllowIndexing = allowIndexing;
    }

    /// <summary>Scheme, host and port only - no path, query or fragment. Null when not configured.</summary>
    public Uri? Origin { get; }

    public bool AllowIndexing { get; }

    /// <summary>Crawlers are invited only with both an origin to name and an explicit yes.</summary>
    public bool Indexable => Origin is not null && AllowIndexing;

    /// <summary>An absolute URL on the public origin for a site-relative path, or null without an origin.</summary>
    public string? Absolute(string path) => Origin is null ? null : Origin.GetLeftPart(UriPartial.Authority) + path;

    /// <summary>
    /// Reads and checks the configuration. A malformed origin fails the host at startup, loudly, rather than
    /// quietly emitting wrong canonical URLs for as long as nobody looks.
    /// </summary>
    public static PublicSite From(IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var text = section["Origin"]?.Trim();
        Uri? origin = null;

        if (!string.IsNullOrEmpty(text))
        {
            if (!Uri.TryCreate(text, UriKind.Absolute, out var parsed)
                || parsed.Scheme is not ("http" or "https")
                || parsed.AbsolutePath != "/"
                || !string.IsNullOrEmpty(parsed.Query)
                || !string.IsNullOrEmpty(parsed.Fragment)
                || !string.IsNullOrEmpty(parsed.UserInfo))
            {
                throw new InvalidOperationException(
                    $"{SectionName}:Origin must be an absolute http or https origin with no path, such as https://lorevolve.example.");
            }

            origin = parsed;
        }

        return new PublicSite(origin, section.GetValue("AllowIndexing", defaultValue: false));
    }
}
