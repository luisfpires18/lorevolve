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
    /// A translated code's refusal says the same thing wherever it is answered.
    ///
    /// This is the assertion that matters most, and the one whose absence cost a round of CI. A dictionary entry
    /// replaces the server's sentence for every refusal carrying that code. Where the server's sentence is built from
    /// the author's own records - "a date in {month} uses day {day}", "{entity} can't change type because {field}
    /// points at it" - or differs by who is asking, one fixed sentence cannot say it, and translating the code throws
    /// the detail away. So a code may be translated only where every call site's <c>detail</c> is a plain string
    /// literal: no interpolation, no expression, no variable. A refusal with no <c>detail</c> at all is fine, because
    /// then the dictionary entry is the only sentence there is.
    ///
    /// A code that fails this does not stay English for good: it waits for the API to send its pieces as extensions,
    /// which is the follow-up #108 names.
    /// </summary>
    [Fact]
    public void A_translated_code_never_covers_a_detail_built_from_the_author_s_own_records()
    {
        var translated = DictionaryCodes().ToHashSet(StringComparer.Ordinal);
        var names = ConstantNames();
        var offenders = new List<string>();

        foreach (var file in ApiSources())
        {
            var body = File.ReadAllText(file);

            // A constant's simple name is not unique in the API: two features both call theirs `BlockedCode`. So an
            // unqualified name is resolved against the file it is written in, and a qualified one against its type.
            var local = Regex
                .Matches(body, @"const string (\w+)\s*=\s*""([a-z0-9_]+)""")
                .ToDictionary(match => match.Groups[1].Value, match => match.Groups[2].Value, StringComparer.Ordinal);

            foreach (var call in Calls(body))
            {
                if (CodeOf(call, local, names) is not { } code || !translated.Contains(code))
                {
                    continue;
                }

                if (DetailArgument(call) is { } detail && !IsFixedSentence(detail, body) && !LorEvolveOwnWords.Contains(code))
                {
                    offenders.Add($"{code} in {Path.GetFileName(file)} (detail: {detail[..Math.Min(40, detail.Length)]})");
                }
            }
        }

        Assert.True(
            offenders.Count == 0,
            "These codes are translated in src/i18n/en/apiErrors.ts, but the API builds their detail from the "
                + "author's own records or from who is asking, so one fixed sentence cannot say it. Remove the "
                + $"dictionary entry, or make the refusal's detail a plain literal:{Environment.NewLine}"
                + string.Join(Environment.NewLine, offenders.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal)));
    }

    /// <summary>
    /// A translated code says, in English, exactly what the server already said.
    ///
    /// This is #99's rule for all of its children: taking text out of the server is a pure move, so the English a
    /// reader sees does not change and the specs that assert it keep passing. Portuguese is the only new text. The
    /// rule was followed by eye once and eighteen entries had drifted, none of them caught by a test, so it is
    /// checked here against the API's own sources.
    ///
    /// A code whose refusal carries no <c>detail</c> at all is exempt: there is no English to preserve, and the
    /// dictionary entry says something where nothing was said.
    /// </summary>
    [Fact]
    public void A_translated_code_says_in_english_exactly_what_the_server_says()
    {
        var english = DictionaryEntries();
        var names = ConstantNames();
        var saidBy = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);

        foreach (var file in ApiSources())
        {
            var body = File.ReadAllText(file);
            var local = Regex
                .Matches(body, @"const string (\w+)\s*=\s*""([a-z0-9_]+)""")
                .ToDictionary(match => match.Groups[1].Value, match => match.Groups[2].Value, StringComparer.Ordinal);

            foreach (var call in Calls(body))
            {
                if (CodeOf(call, local, names) is not { } code || !english.ContainsKey(code))
                {
                    continue;
                }

                if (SentenceOf(call, body) is { } sentence)
                {
                    (saidBy.TryGetValue(code, out var said) ? said : saidBy[code] = new(StringComparer.Ordinal)).Add(sentence);
                }
            }
        }

        var drifted = english
            .Where(entry => saidBy.TryGetValue(entry.Key, out var said) && !said.Contains(entry.Value))
            .Select(entry =>
                $"{entry.Key}{Environment.NewLine}      dictionary: {entry.Value}{Environment.NewLine}"
                + string.Join(Environment.NewLine, saidBy[entry.Key].Select(said => $"      server:     {said}")))
            .Order(StringComparer.Ordinal)
            .ToList();

        Assert.True(
            drifted.Count == 0,
            "These entries in src/i18n/en/apiErrors.ts do not say what the server says, so this PR changes the "
                + "English a reader sees. Copy the server's sentence, or, where the code is answered with more than "
                + $"one sentence, drop the entry and let it fall back:{Environment.NewLine}"
                + string.Join(Environment.NewLine, drifted));
    }

    /// <summary>
    /// The <c>detail</c> a call states as one fixed sentence, or null when it has none or builds one. Covers the
    /// named argument, a <c>const string</c> in the same file, adjacent literals joined with <c>+</c>, and the third
    /// positional argument of the <c>Changed</c> and <c>Problem</c> helpers that take <c>(code, title, detail)</c>.
    /// </summary>
    private static string? SentenceOf(string call, string body)
    {
        var flat = Regex.Replace(call, @"\n\s+", " ");

        var named = Regex.Match(flat, @"detail:\s*((?:""(?:[^""\\]|\\.)*""\s*\+?\s*)+)");
        if (named.Success)
        {
            return Joined(named.Groups[1].Value);
        }

        var byName = Regex.Match(flat, @"detail:\s*([A-Za-z_][A-Za-z0-9_]*)\s*,");
        if (byName.Success)
        {
            var declared = Regex.Match(body, @"const string " + Regex.Escape(byName.Groups[1].Value) + @"\s*=\s*\n?\s*""((?:[^""\\]|\\.)*)""");
            return declared.Success ? Unescape(declared.Groups[1].Value) : null;
        }

        var positional = Regex.Match(
            flat,
            @"^(?:EditVersion\.Changed|Problem)\s*\(\s*[A-Za-z0-9_.]+\s*,\s*""(?:[^""\\]|\\.)*""\s*,\s*((?:""(?:[^""\\]|\\.)*""\s*\+?\s*)+)");

        return positional.Success ? Joined(positional.Groups[1].Value) : null;
    }

    /// <summary>Adjacent C# literals joined with <c>+</c>, as one sentence.</summary>
    private static string Joined(string literals) =>
        string.Concat(Regex.Matches(literals, @"""((?:[^""\\]|\\.)*)""").Select(match => Unescape(match.Groups[1].Value)));

    private static string Unescape(string literal) => literal.Replace("\\\"", "\"", StringComparison.Ordinal);

    /// <summary>Every code in the English dictionary with the sentence it gives, read from the file that ships.</summary>
    private static Dictionary<string, string> DictionaryEntries()
    {
        var body = File.ReadAllText(DictionaryPath());
        var start = body.IndexOf("const apiErrors = {", StringComparison.Ordinal);
        Assert.True(start >= 0, "apiErrors.ts no longer declares `const apiErrors = {`.");

        // A key at two spaces, then its value: one quoted string, or several that Prettier wrapped onto the lines
        // after it. A following key always starts a line at two spaces, which ends the value.
        var entries = Regex
            .Matches(
                body[start..],
                @"^  ([a-z][a-z0-9_]*):((?:[^\n]*\n(?:    [^\n]*\n)*))",
                RegexOptions.Multiline)
            .ToDictionary(
                match => match.Groups[1].Value,
                match => string.Concat(
                    Regex.Matches(match.Groups[2].Value, @"'((?:[^'\\]|\\.)*)'|""((?:[^""\\]|\\.)*)""")
                        .Select(piece => (piece.Groups[1].Success ? piece.Groups[1].Value : piece.Groups[2].Value)
                            .Replace("\\'", "'", StringComparison.Ordinal)
                            .Replace("\\\"", "\"", StringComparison.Ordinal))),
                StringComparer.Ordinal);

        Assert.True(entries.Count > 30, $"Only {entries.Count} entries were read out of apiErrors.ts; the parse must be wrong.");
        Assert.DoesNotContain(entries, entry => entry.Value.Length == 0);
        return entries;
    }

    /// <summary>Every C# source file of the API, skipping what the build writes.</summary>
    private static IEnumerable<string> ApiSources() =>
        Directory
            .EnumerateFiles(Path.Combine(RepositoryRoot(), "src", "LorEvolve.Api"), "*.cs", SearchOption.AllDirectories)
            .Where(file =>
                !file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal));

    private static string DictionaryPath() =>
        Path.Combine(RepositoryRoot(), "src", "LorEvolve.Web", "src", "i18n", "en", "apiErrors.ts");

    /// <summary>Every <c>Results.Problem</c> and friend in a file, each as its own whole call, parentheses matched.</summary>
    private static IEnumerable<string> Calls(string body)
    {
        string[] openers = ["Results.Problem(", "Results.ValidationProblem(", "EditVersion.Changed(", "Refused("];

        foreach (var opener in openers)
        {
            var at = 0;
            while ((at = body.IndexOf(opener, at, StringComparison.Ordinal)) >= 0)
            {
                var index = at + opener.Length;
                var depth = 1;
                while (index < body.Length && depth > 0)
                {
                    depth += body[index] switch { '(' => 1, ')' => -1, _ => 0 };
                    index++;
                }

                yield return body[at..index];
                at = index;
            }
        }
    }

    /// <summary>The code a call carries: its <c>["code"]</c> extension, or the first argument of a helper that takes one.</summary>
    private static string? CodeOf(string call, IReadOnlyDictionary<string, string> local, IReadOnlyDictionary<string, string> qualified)
    {
        var extension = Regex.Match(call, @"\[""code""\]\s*=\s*(""[a-z0-9_]+""|[A-Za-z0-9_.]+)");
        if (extension.Success)
        {
            var token = extension.Groups[1].Value;
            return token.StartsWith('"') ? token.Trim('"') : Resolve(token, local, qualified);
        }

        var first = Regex.Match(call, @"^(?:EditVersion\.Changed|Refused)\(\s*([A-Za-z0-9_.]+)\s*,");
        return first.Success ? Resolve(first.Groups[1].Value, local, qualified) : null;
    }

    /// <summary><c>Type.Name</c> against that type's constants; a bare <c>Name</c> against its own file's.</summary>
    private static string? Resolve(string token, IReadOnlyDictionary<string, string> local, IReadOnlyDictionary<string, string> qualified)
    {
        var parts = token.Split('.');
        return parts.Length > 1
            ? qualified.GetValueOrDefault(string.Join('.', parts[^2..]))
            : local.GetValueOrDefault(parts[0]);
    }

    /// <summary>
    /// The codes whose <c>detail</c> varies and may still be translated, because what it varies between is
    /// LorEvolve's own prose rather than anything of the author's. Adding to this list is a deliberate act: every
    /// entry has to be a case where one dictionary sentence is true of every detail the API can send.
    /// </summary>
    private static readonly HashSet<string> LorEvolveOwnWords = new(StringComparer.Ordinal)
    {
        // The detail is the MediaStorageException's message, which is LorEvolve's own sentence and never the
        // provider's (see MediaObjectStore.cs): "not configured" or "did not answer", and the dictionary's
        // "unavailable right now" is true of both.
        MediaProblem.UnavailableCode,
    };

    /// <summary>
    /// Whether a <c>detail</c> is one fixed sentence: a string literal, or a bare name that is a <c>const string</c>
    /// in the same file. Interpolation, a ternary, a member access or a parameter is not.
    /// </summary>
    private static bool IsFixedSentence(string detail, string body)
    {
        if (detail.StartsWith('"'))
        {
            return true;
        }

        var name = Regex.Match(detail, @"^([A-Za-z_][A-Za-z0-9_]*)\s*,");
        return name.Success
            && Regex.IsMatch(body, @"const string " + Regex.Escape(name.Groups[1].Value) + @"\s*=\s*$?""");
    }

    /// <summary>The <c>detail:</c> argument as written, or null when the call has none.</summary>
    private static string? DetailArgument(string call)
    {
        var match = Regex.Match(call, @"detail:\s*(\S)");
        return match.Success ? call[match.Groups[1].Index..] : null;
    }

    /// <summary><c>Type.Constant</c> to its string value, for a call site that names another feature's constant.</summary>
    private static Dictionary<string, string> ConstantNames()
    {
        var names = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var type in typeof(MediaProblem).Assembly.GetTypes())
        {
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
            {
                if (field.IsLiteral && field.FieldType == typeof(string) && field.GetRawConstantValue() is string value)
                {
                    names[$"{type.Name}.{field.Name}"] = value;
                }
            }
        }

        return names;
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
        var path = DictionaryPath();
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
