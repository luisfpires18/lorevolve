using System.Reflection;
using System.Text.RegularExpressions;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Publishing;

namespace LorEvolve.Api.Tests;

/// <summary>
/// The contract between the API's refusal codes and the web app's words for them (#108).
///
/// A refusal carries a stable <c>code</c>, and <c>src/i18n/en/apiErrors.ts</c> says the ones LorEvolve has words for
/// in the reader's language; the rest fall back to the server's English <c>detail</c>. That fallback is what makes
/// partial coverage safe, and it is also what hides every mistake in this feature: a renamed code leaves its entry
/// unreachable, a code answered with two different sentences loses one of them, and a reworded entry changes the
/// English nobody asked to change. None of that fails a request or a screen, so these tests are the only thing that
/// catches it. Each one here was written after the mistake it describes had already shipped into a review round.
///
/// They read the dictionary file and the API's own sources rather than a copy of either, so they are about what
/// ships. No HTTP and no database: a few hundred milliseconds, and no reason for anyone to skip them.
/// </summary>
public sealed class ApiErrorCodeContractTests
{
    /// <summary>
    /// The codes whose <c>detail</c> varies and may still be translated, because what it varies between is
    /// LorEvolve's own prose rather than anything of the author's. Adding to this list is a deliberate act: every
    /// entry has to be a case where one dictionary sentence is true of every detail the API can send.
    /// </summary>
    private static readonly HashSet<string> LorEvolveOwnWords = new(StringComparer.Ordinal)
    {
        // The detail is the MediaStorageException's message, which is LorEvolve's own sentence and never the
        // provider's (see MediaObjectStore.cs): "not configured" or "did not answer", and the dictionary's
        // "Image storage is unavailable." is true of both.
        MediaProblem.UnavailableCode,
    };

    /// <summary>
    /// The codes whose refusal carries no <c>detail</c> at all, so there is no English to preserve and the
    /// dictionary entry says something where nothing was said. Every other translated code must be matched to a
    /// sentence the server states, or <see cref="A_translated_code_says_in_english_exactly_what_the_server_says"/>
    /// fails: without this list, a code the parser simply failed to find would pass unnoticed.
    /// </summary>
    private static readonly HashSet<string> NoDetailOfTheirOwn = new(StringComparer.Ordinal)
    {
        // A ValidationProblem whose field errors say what publishing still needs.
        PublicationEndpoints.RequiredWhilePublicCode,
    };

    /// <summary>Every code the dictionary has words for is a code the API still declares.</summary>
    [Fact]
    public void Every_translated_code_is_one_the_api_declares()
    {
        var declared = DeclaredCodes();
        var unknown = DictionaryEntries().Keys.Where(code => !declared.Contains(code)).Order(StringComparer.Ordinal).ToList();

        Assert.True(
            unknown.Count == 0,
            $"{string.Join(", ", unknown)} in src/i18n/en/apiErrors.ts match no code the API declares. "
                + "Either the code was renamed and the dictionary key has to follow, or the key is a typo.");
    }

    /// <summary>The codes are the shape a client can match on: lower case, words joined by underscores.</summary>
    [Fact]
    public void Declared_codes_are_stable_identifiers()
    {
        var odd = DeclaredCodes().Where(code => !Regex.IsMatch(code, "^[a-z][a-z0-9_]*$")).Order(StringComparer.Ordinal).ToList();
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
    /// A dictionary entry replaces the server's sentence for every refusal carrying that code. Where that sentence is
    /// built from the author's own records - "a date in {month} uses day {day}", "{entity} can't change type because
    /// {field} points at it" - or differs by who is asking, one fixed sentence cannot say it, and translating the
    /// code throws the detail away. So a code may be translated only where every call site's <c>detail</c> is one
    /// fixed sentence: a string literal, or a <c>const string</c> in the same file.
    ///
    /// A code that fails this does not stay English for good: it waits for the API to send its pieces as extensions.
    /// </summary>
    [Fact]
    public void A_translated_code_never_covers_a_detail_built_from_the_author_s_own_records()
    {
        var translated = DictionaryEntries().Keys.ToHashSet(StringComparer.Ordinal);
        var names = ConstantNames();
        var offenders = new List<string>();

        foreach (var (file, body) in ApiSources())
        {
            var local = LocalCodes(body);

            foreach (var call in Calls(body))
            {
                if (CodeOf(call, local, names) is not { } code || !translated.Contains(code))
                {
                    continue;
                }

                if (DetailExpression(call) is { } detail
                    && !IsFixedSentence(detail, body)
                    && !LorEvolveOwnWords.Contains(code))
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
    /// A translated code says, in English, exactly what the server already says, and every translated code is
    /// accounted for.
    ///
    /// This is #99's rule for all of its children: taking text out of the server is a pure move, so the English a
    /// reader sees does not change and the specs that assert it keep passing. Portuguese is the only new text. The
    /// rule was followed by eye once and eighteen entries had drifted, none of them caught by a test.
    ///
    /// A code the parser cannot match to any sentence fails too, unless it is listed in
    /// <see cref="NoDetailOfTheirOwn"/> or <see cref="LorEvolveOwnWords"/>. Skipping the unmatched would let this
    /// whole assertion go quiet the moment a refusal is written in a shape the parser does not read.
    /// </summary>
    [Fact]
    public void A_translated_code_says_in_english_exactly_what_the_server_says()
    {
        var english = DictionaryEntries();
        var names = ConstantNames();
        var saidBy = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);

        foreach (var (_, body) in ApiSources())
        {
            var local = LocalCodes(body);

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
                + string.Join(Environment.NewLine, saidBy[entry.Key].Order(StringComparer.Ordinal).Select(said => $"      server:     {said}")))
            .Order(StringComparer.Ordinal)
            .ToList();

        Assert.True(
            drifted.Count == 0,
            "These entries in src/i18n/en/apiErrors.ts do not say what the server says, so this changes the English "
                + "a reader sees. Copy the server's sentence, or, where the code is answered with more than one "
                + $"sentence, drop the entry and let it fall back:{Environment.NewLine}"
                + string.Join(Environment.NewLine, drifted));

        var unaccounted = english.Keys
            .Where(code => !saidBy.ContainsKey(code) && !NoDetailOfTheirOwn.Contains(code) && !LorEvolveOwnWords.Contains(code))
            .Order(StringComparer.Ordinal)
            .ToList();

        Assert.True(
            unaccounted.Count == 0,
            $"No sentence was found in the API for {string.Join(", ", unaccounted)}, so nothing above checked them. "
                + "Either the refusal is written in a shape this test cannot read, and the reader needs teaching, "
                + "or the code carries no detail and belongs in NoDetailOfTheirOwn with the reason.");
    }

    // ---------- Reading the API's sources ----------

    /// <summary>
    /// Every call that answers a refusal, each as its own whole call with parentheses matched. The bare names are
    /// the per-feature helpers that pass a code positionally; the lookbehind keeps <c>Results.Problem</c> from being
    /// counted twice as <c>Problem</c>.
    /// </summary>
    private static IEnumerable<string> Calls(string body)
    {
        string[] openers =
        [
            @"Results\.Problem\(",
            @"Results\.ValidationProblem\(",
            @"EditVersion\.Changed\(",
            @"(?<![A-Za-z0-9_.])Problem\(",
            @"(?<![A-Za-z0-9_.])Refused\(",
            @"(?<![A-Za-z0-9_.])StateChanged\(",
        ];

        foreach (var opener in openers)
        {
            foreach (var start in Regex.Matches(body, opener).Select(match => match.Index))
            {
                var index = body.IndexOf('(', start) + 1;
                var depth = 1;
                while (index < body.Length && depth > 0)
                {
                    depth += body[index] switch { '(' => 1, ')' => -1, _ => 0 };
                    index++;
                }

                yield return body[start..index];
            }
        }
    }

    /// <summary>The arguments of a call, split at the commas that are not inside brackets or a string.</summary>
    private static List<string> Arguments(string call)
    {
        var inner = call[(call.IndexOf('(') + 1)..^1];
        var arguments = new List<string>();
        var current = new System.Text.StringBuilder();
        var depth = 0;
        var inString = false;
        var escaped = false;

        foreach (var character in inner)
        {
            if (escaped)
            {
                current.Append(character);
                escaped = false;
                continue;
            }

            if (inString && character == '\\')
            {
                current.Append(character);
                escaped = true;
                continue;
            }

            if (character == '"')
            {
                inString = !inString;
                current.Append(character);
                continue;
            }

            if (!inString)
            {
                switch (character)
                {
                    case '(' or '[' or '{':
                        depth++;
                        break;
                    case ')' or ']' or '}':
                        depth--;
                        break;
                    case ',' when depth == 0:
                        arguments.Add(current.ToString());
                        current.Clear();
                        continue;
                }
            }

            current.Append(character);
        }

        if (current.ToString().Trim().Length > 0)
        {
            arguments.Add(current.ToString());
        }

        return arguments;
    }

    /// <summary>
    /// The code a call carries: its <c>["code"]</c> extension, else the first argument that is the name of a code
    /// constant, which covers every per-feature helper whatever else it takes and in whatever order.
    /// </summary>
    private static string? CodeOf(string call, IReadOnlyDictionary<string, string> local, IReadOnlyDictionary<string, string> qualified)
    {
        var extension = Regex.Match(call, @"\[""code""\]\s*=\s*(""[a-z0-9_]+""|[A-Za-z0-9_.]+)");
        if (extension.Success)
        {
            var token = extension.Groups[1].Value;
            return token.StartsWith('"') ? token.Trim('"') : Resolve(token, local, qualified);
        }

        foreach (var argument in Arguments(call).Select(argument => argument.Trim()))
        {
            if (Regex.IsMatch(argument, @"^[A-Za-z0-9_.]+$") && Resolve(argument, local, qualified) is { } code)
            {
                return code;
            }
        }

        return null;
    }

    /// <summary><c>Type.Name</c> against that type's constants; a bare <c>Name</c> against its own file's.</summary>
    private static string? Resolve(string token, IReadOnlyDictionary<string, string> local, IReadOnlyDictionary<string, string> qualified)
    {
        var parts = token.Split('.');
        return parts.Length > 1
            ? qualified.GetValueOrDefault(string.Join('.', parts[^2..]))
            : local.GetValueOrDefault(parts[0]);
    }

    /// <summary>The <c>detail:</c> argument as written, or null when the call names none.</summary>
    private static string? DetailExpression(string call)
    {
        var match = Regex.Match(call, @"detail:\s*(\S)");
        return match.Success ? call[match.Groups[1].Index..] : null;
    }

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
        return name.Success && DeclaredSentence(name.Groups[1].Value, body) is not null;
    }

    /// <summary>
    /// The sentence a call states as its <c>detail</c>, or null when it has none or builds one. Covers the named
    /// argument, a <c>const string</c> in the same file, adjacent literals joined with <c>+</c>, and a positional
    /// helper, where the detail is the last argument written entirely as literals: a helper always takes the title
    /// before it, so a call with only one such argument is stating a title and no detail.
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
            return DeclaredSentence(byName.Groups[1].Value, body);
        }

        if (flat.Contains("detail:", StringComparison.Ordinal))
        {
            return null;
        }

        var literals = Arguments(flat).Where(argument => Regex.IsMatch(argument, @"^\s*(?:""(?:[^""\\]|\\.)*""\s*\+?\s*)+$")).ToList();
        return literals.Count >= 2 ? Joined(literals[^1]) : null;
    }

    /// <summary>The value of a <c>const string</c> declared in this file, or null.</summary>
    private static string? DeclaredSentence(string name, string body)
    {
        var declared = Regex.Match(body, @"const string " + Regex.Escape(name) + @"\s*=\s*\n?\s*""((?:[^""\\]|\\.)*)""");
        return declared.Success ? Unescape(declared.Groups[1].Value) : null;
    }

    /// <summary>Adjacent C# literals joined with <c>+</c>, as one sentence.</summary>
    private static string Joined(string literals) =>
        string.Concat(Regex.Matches(literals, @"""((?:[^""\\]|\\.)*)""").Select(match => Unescape(match.Groups[1].Value)));

    private static string Unescape(string literal) => literal.Replace("\\\"", "\"", StringComparison.Ordinal);

    /// <summary>The code constants declared in one file, by their bare name.</summary>
    private static Dictionary<string, string> LocalCodes(string body) =>
        Regex
            .Matches(body, @"const string (\w+)\s*=\s*""([a-z0-9_]+)""")
            .ToDictionary(match => match.Groups[1].Value, match => match.Groups[2].Value, StringComparer.Ordinal);

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

                if ((all || field.Name.EndsWith("Code", StringComparison.Ordinal))
                    && field.GetRawConstantValue() is string value
                    && value.Length > 0)
                {
                    codes.Add(value);
                }
            }
        }

        Assert.True(codes.Count > 50, $"Only {codes.Count} codes were found; the convention must have changed.");
        return codes;
    }

    // ---------- Reading the dictionary the web app ships ----------

    /// <summary>Every code in the English dictionary with the sentence it gives, read from the file that ships.</summary>
    private static Dictionary<string, string> DictionaryEntries()
    {
        var path = DictionaryPath();
        Assert.True(File.Exists(path), $"{path} is not there. Did the dictionary move?");

        var body = File.ReadAllText(path);
        var start = body.IndexOf("const apiErrors = {", StringComparison.Ordinal);
        Assert.True(start >= 0, "apiErrors.ts no longer declares `const apiErrors = {`.");

        // A key at two spaces, then its value: one quoted string, or several that Prettier wrapped onto the lines
        // after it. A following key always starts a line at two spaces, which ends the value.
        var entries = Regex
            .Matches(body[start..], @"^  ([a-z][a-z0-9_]*):((?:[^\n]*\n(?:    [^\n]*\n)*))", RegexOptions.Multiline)
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

    private static string DictionaryPath() =>
        Path.Combine(RepositoryRoot(), "src", "LorEvolve.Web", "src", "i18n", "en", "apiErrors.ts");

    /// <summary>Every C# source file of the API with its text, skipping what the build writes.</summary>
    private static IEnumerable<(string File, string Body)> ApiSources() =>
        Directory
            .EnumerateFiles(Path.Combine(RepositoryRoot(), "src", "LorEvolve.Api"), "*.cs", SearchOption.AllDirectories)
            .Where(file =>
                !file.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !file.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Select(file => (file, File.ReadAllText(file)));

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
