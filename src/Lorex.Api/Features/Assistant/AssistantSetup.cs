using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// Which model this host's assistant runs on, and how often one account may ask it (ADR 0045).
///
/// Four providers, chosen by <c>Assistant:Provider</c>, as <c>Media:Provider</c> chooses an object store:
///
///   OpenAI   - OpenAI's Responses API, with <c>Assistant:OpenAI:ApiKey</c> and <c>Assistant:OpenAI:Model</c>.
///   Groq     - Groq's OpenAI-compatible Responses API, with <c>Assistant:Groq:ApiKey</c> and <c>Assistant:Groq:Model</c>
///              (for example <c>openai/gpt-oss-120b</c>).
///   Fake     - <see cref="FakeAssistantProvider"/>: the local server and the Playwright suite, no network, no key.
///   (unset)  - <see cref="UnavailableAssistantProvider"/>. The assistant says it is not set up; nothing else changes.
///
/// For OpenAI and Groq both settings are required and neither has a default: the key is a secret (user secrets locally,
/// App Service settings in Azure), and the model is the operator's choice, named nowhere in the code. A host never fails
/// to start over this: a provider named without both settings, or a name no provider has, is treated as unset - never
/// as Fake, which is only ever chosen by name.
/// </summary>
public static class AssistantSetup
{
    /// <summary>
    /// How many questions one account may ask in <see cref="QuestionWindow"/>, across every universe. Each question is at
    /// most seven model calls, so this caps what one account can spend.
    /// </summary>
    public const int QuestionsPerWindow = 20;

    public static readonly TimeSpan QuestionWindow = TimeSpan.FromMinutes(10);

    public const string RateLimitedCode = "assistant_rate_limited";

    public static IServiceCollection AddLorexAssistant(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection("Assistant");
        var provider = section["Provider"];

        if (string.Equals(provider, "Fake", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAssistantProvider, FakeAssistantProvider>();
        }
        else if (string.Equals(provider, "OpenAI", StringComparison.OrdinalIgnoreCase)
            && KeyAndModel(section.GetSection("OpenAI")) is var (openAiKey, openAiModel))
        {
            services.AddSingleton<IAssistantProvider>(_ =>
                new OpenAIAssistantProvider(OpenAIAssistantProvider.CreateClient(openAiKey), openAiModel));
        }
        else if (string.Equals(provider, "Groq", StringComparison.OrdinalIgnoreCase)
            && KeyAndModel(section.GetSection("Groq")) is var (groqKey, groqModel))
        {
            services.AddSingleton<IAssistantProvider>(_ =>
                new GroqAssistantProvider(GroqAssistantProvider.CreateClient(groqKey), groqModel));
        }
        else
        {
            services.AddSingleton<IAssistantProvider, UnavailableAssistantProvider>();
        }

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<AssistantAllowance>();

        return services;
    }

    /// <summary>A provider's key and model, or null unless both are set.</summary>
    private static (string ApiKey, string Model)? KeyAndModel(IConfigurationSection section) =>
        string.IsNullOrWhiteSpace(section["ApiKey"]) || string.IsNullOrWhiteSpace(section["Model"])
            ? null
            : (section["ApiKey"]!, section["Model"]!);
}
