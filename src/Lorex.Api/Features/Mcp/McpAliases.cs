using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Lorex.Api.Data;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// A universe's friendly MCP address (issue 59, ADR 0062 amendment of ADR 0046): <c>{origin}/mcp/u/{alias}</c>, such as
/// <c>/mcp/u/lotr-7k2f</c>, beside the canonical <c>/mcp/universes/{id}</c> - which keeps working, so no existing connection
/// changes. The alias is the universe's name made readable, cut short, and four random characters, so two universes never
/// share one and nobody can guess one from a name.
///
/// <para><b>An address, never a credential.</b> The universe an alias names is resolved here, server-side, from the alias
/// alone; the token, the connection and the person's role decide everything else, exactly as for the canonical address. An
/// alias that names nothing is answered the way one that names a universe the caller cannot read is.</para>
///
/// <para><b>Stable.</b> Made the first time Connect to AI is opened, and kept: renaming the universe does not move it, so a
/// connection made with it keeps working. It goes with the universe.</para>
/// </summary>
public sealed class McpUniverseAlias
{
    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public required string Alias { get; set; }
}

public sealed class McpUniverseAliasConfiguration : IEntityTypeConfiguration<McpUniverseAlias>
{
    public void Configure(EntityTypeBuilder<McpUniverseAlias> builder)
    {
        // A table of MCP's own beside Universes, never a column on it: nothing about a universe changes for an address.
        builder.ToTable("McpUniverseAliases");
        builder.HasKey(alias => alias.UniverseId);
        builder.Property(alias => alias.Alias).HasMaxLength(McpAliases.MaxLength);
        builder.HasIndex(alias => alias.Alias).IsUnique();
        builder.HasOne(alias => alias.Universe).WithMany().HasForeignKey(alias => alias.UniverseId).OnDelete(DeleteBehavior.Cascade);
    }
}

public static partial class McpAliases
{
    public const string PathPrefix = "/mcp/u/";

    public const int MaxLength = 40;

    /// <summary>How much of the name an alias keeps, before its random suffix.</summary>
    private const int NameLength = 24;

    /// <summary>Lowercase letters and digits without the look-alikes 0, 1, l and o.</summary>
    private const string Suffix = "abcdefghijkmnpqrstuvwxyz23456789";

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex Shape();

    public static bool IsAlias(string? text) => text is { Length: > 0 and <= MaxLength } && Shape().IsMatch(text);

    public static string Resource(McpSite site, string alias) => $"{site.Base}{PathPrefix}{alias}";

    public static string ResourceMetadata(McpSite site, string alias) => $"{site.Base}{McpSite.ResourceMetadataPrefix}{PathPrefix}{alias}";

    /// <summary>The alias a resource indicator names, or null when it is no alias address of this origin.</summary>
    public static string? AliasOf(McpSite site, string? resource)
    {
        if (!site.IsEnabled || resource is null)
        {
            return null;
        }

        var prefix = site.Base + PathPrefix;
        return resource.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && resource[prefix.Length..] is var alias && IsAlias(alias) ? alias : null;
    }

    /// <summary>The universe a resource indicator names, in either spelling - canonical by id, or friendly by alias - or null.</summary>
    public static async Task<Guid?> UniverseOfAsync(LorexDbContext db, McpSite site, string? resource, CancellationToken cancellationToken) =>
        site.UniverseOf(resource) ?? (AliasOf(site, resource) is { } alias ? await UniverseOfAliasAsync(db, alias, cancellationToken) : null);

    public static Task<Guid?> UniverseOfAliasAsync(LorexDbContext db, string alias, CancellationToken cancellationToken) =>
        db.McpUniverseAliases.AsNoTracking().Where(row => row.Alias == alias).Select(row => (Guid?)row.UniverseId).FirstOrDefaultAsync(cancellationToken);

    /// <summary>The universe's alias, made and kept the first time it is asked for.</summary>
    public static async Task<string> EnsureAsync(LorexDbContext db, Guid universeId, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 8; attempt++)
        {
            if (await db.McpUniverseAliases.AsNoTracking().Where(row => row.UniverseId == universeId).Select(row => row.Alias).FirstOrDefaultAsync(cancellationToken) is { } kept)
            {
                return kept;
            }

            var name = await db.Universes.AsNoTracking().Where(row => row.Id == universeId).Select(row => row.Name).SingleAsync(cancellationToken);
            var alias = $"{Readable(name)}-{RandomNumberGenerator.GetString(Suffix, 4)}";

            // One row per universe and one universe per alias: two first reads at once keep whichever landed first, and an alias
            // another universe took is simply not written, so the next round tries another suffix. The id as EF Core stores it.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT OR IGNORE INTO \"McpUniverseAliases\" (\"UniverseId\", \"Alias\") VALUES ({universeId.ToString().ToUpperInvariant()}, {alias})",
                cancellationToken);
        }

        throw new InvalidOperationException("No free MCP alias was found for this universe.");
    }

    /// <summary>
    /// Common accented Latin letters and their plain ones. The host runs with invariant globalization, where Unicode
    /// decomposition is unavailable, so the few an author is likely to write are folded by hand; anything else is a word break.
    /// </summary>
    private static readonly Dictionary<char, string> Folds = new()
    {
        ['à'] = "a", ['á'] = "a", ['â'] = "a", ['ã'] = "a", ['ä'] = "a", ['å'] = "a", ['ā'] = "a", ['ą'] = "a", ['æ'] = "ae",
        ['ç'] = "c", ['ć'] = "c", ['č'] = "c", ['ď'] = "d", ['ð'] = "d",
        ['è'] = "e", ['é'] = "e", ['ê'] = "e", ['ë'] = "e", ['ē'] = "e", ['ę'] = "e", ['ě'] = "e",
        ['ì'] = "i", ['í'] = "i", ['î'] = "i", ['ï'] = "i", ['ī'] = "i",
        ['ł'] = "l", ['ñ'] = "n", ['ń'] = "n", ['ň'] = "n",
        ['ò'] = "o", ['ó'] = "o", ['ô'] = "o", ['õ'] = "o", ['ö'] = "o", ['ø'] = "o", ['ō'] = "o", ['œ'] = "oe",
        ['ř'] = "r", ['ś'] = "s", ['š'] = "s", ['ß'] = "ss", ['ť'] = "t", ['þ'] = "th",
        ['ù'] = "u", ['ú'] = "u", ['û'] = "u", ['ü'] = "u", ['ū'] = "u", ['ů'] = "u",
        ['ý'] = "y", ['ÿ'] = "y", ['ź'] = "z", ['ż'] = "z", ['ž'] = "z",
    };

    /// <summary>The name in lowercase ASCII letters and digits, words joined by dashes, cut at a word; "world" when nothing is left.</summary>
    internal static string Readable(string name)
    {
        var plain = new StringBuilder();
        foreach (var character in name.ToLowerInvariant())
        {
            plain.Append(char.IsAsciiLetterOrDigit(character) ? character.ToString() : Folds.GetValueOrDefault(character, "-"));
        }

        var words = plain.ToString().Split('-', StringSplitOptions.RemoveEmptyEntries);
        var readable = new StringBuilder();
        foreach (var word in words)
        {
            if (readable.Length + word.Length + (readable.Length == 0 ? 0 : 1) > NameLength)
            {
                if (readable.Length == 0)
                {
                    readable.Append(word[..NameLength]);
                }

                break;
            }

            readable.Append(readable.Length == 0 ? word : $"-{word}");
        }

        return readable.Length == 0 ? "world" : readable.ToString();
    }
}
