using System.Reflection;
using System.Text.RegularExpressions;
using LorEvolve.Api.Features.Media;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The contract between the API's refusal codes and the web app's words for them (#108).
///
/// A refusal carries a stable <c>code</c>, and <c>src/i18n/en/apiErrors.ts</c> maps the ones LorEvolve has words for to
/// a sentence in the reader's language; the rest fall back to the server's English <c>detail</c>. That fallback hides a
/// rename: renaming a code on the server leaves the dictionary entry silently unreachable, and the reader quietly goes
/// back to English. These tests fail instead.
///
/// They read the dictionary file rather than a copy, so the assertion is about the code that ships. No HTTP and no
/// database: a few milliseconds, and no reason for anyone to skip them.
/// </summary>
public sealed class ApiErrorCodeContractTests
{
    /// <summary>Every code the dictionary has words for is a code the API still declares.</summary>
    [Fact]
    public void Every_translated_code_is_one_the_api_declares()
    {
        var declared = DeclaredCodes();
        var unknown = DictionaryCodes().Where(code => !declared.Contains(code)).ToList();

        Assert.True(
            unknown.Count == 0,
            $"{string.Join(", ", unknown)} in src/i18n/en/apiErrors.ts match no code the API declares. "
                + "Either the code was renamed and the dictionary key has to follow, or the key is a typo.");
    }

    /// <summary>The codes are the shape a client can match on: lower case, words joined by underscores.</summary>
    [Fact]
    public void Declared_codes_are_stable_identifiers()
    {
        var odd = DeclaredCodes().Where(code => !Regex.IsMatch(code, "^[a-z][a-z0-9_]*$")).ToList();
        Assert.True(odd.Count == 0, $"Not usable as a stable code: {string.Join(", ", odd)}.");
    }

    /// <summary>The one refusal for object storage is shared, so no feature declares a second code for it.</summary>
    [Fact]
    public void Image_storage_has_one_code()
    {
        Assert.Equal("image_storage_unavailable", MediaProblem.UnavailableCode);
        Assert.DoesNotContain("storage_unavailable", DeclaredCodes().Where(code => code != MediaProblem.UnavailableCode));
    }

    /// <summary>
    /// The string values of the API's public <c>*Code</c> constants, plus every constant of its <c>*Codes</c>
    /// classes. That is where a refusal's code comes from, by convention, everywhere in the API.
    /// </summary>
    private static HashSet<string> DeclaredCodes()
    {
        var codes = new HashSet<string>(StringComparer.Ordinal);

        foreach (var type in typeof(MediaProblem).Assembly.GetTypes())
        {
            var all = type.Name.EndsWith("Codes", StringComparison.Ordinal);

            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy))
            {
                if (!field.IsLiteral || field.FieldType != typeof(string))
                {
                    continue;
                }

                if (all || field.Name.EndsWith("Code", StringComparison.Ordinal))
                {
                    if (field.GetRawConstantValue() is string value && value.Length > 0)
                    {
                        codes.Add(value);
                    }
                }
            }
        }

        Assert.True(codes.Count > 50, $"Only {codes.Count} codes were found; the convention must have changed.");
        return codes;
    }

    /// <summary>The keys of the English dictionary, read from the file the web app ships.</summary>
    private static List<string> DictionaryCodes()
    {
        var path = Path.Combine(RepositoryRoot(), "src", "LorEvolve.Web", "src", "i18n", "en", "apiErrors.ts");
        Assert.True(File.Exists(path), $"{path} is not there. Did the dictionary move?");

        var body = File.ReadAllText(path);
        var start = body.IndexOf("const apiErrors = {", StringComparison.Ordinal);
        Assert.True(start >= 0, "apiErrors.ts no longer declares `const apiErrors = {`.");

        // Keys only: a bare identifier at the start of a line inside the object, before its colon. Quoted values and
        // comments never match, because a key is the first thing on its line and holds no spaces.
        var keys = Regex
            .Matches(body[start..], @"^\s{2}([a-z][a-z0-9_]*):", RegexOptions.Multiline)
            .Select(match => match.Groups[1].Value)
            .ToList();

        Assert.True(keys.Count > 30, $"Only {keys.Count} keys were read out of apiErrors.ts; the parse must be wrong.");
        return keys;
    }

    /// <summary>The repository, found by walking up from the test binary to the folder holding the solution.</summary>
    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "src", "LorEvolve.Web")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory!.FullName;
    }
}
