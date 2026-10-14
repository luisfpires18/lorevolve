using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// Which model this host's assistant runs on, and how often one account may ask it (ADR 0045).
///
/// Three providers, chosen by <c>Assistant:Provider</c>, as <c>Media:Provider</c> chooses an object store:
///
///   OpenAI   - OpenAI's Responses API, with <c>Assistant:OpenAI:ApiKey</c> and <c>Assistant:OpenAI:Model</c>. Both are
///              required and neither has a default: the key is a secret (user secrets locally, App Service settings in
///              Azure), and the model is the operator's choice, named nowhere in the code.
///   Fake     - <see cref="FakeAssistantProvider"/>: the local server and the Playwright suite, no network, no key.
///   (unset)  - <see cref="UnavailableAssistantProvider"/>. The assistant says it is not set up; nothing else changes.
///
/// A host never fails to start over this. OpenAI named without both settings is treated as unset.
/// </summary>
public static class AssistantSetup
{
    public const string RateLimitPolicy = "assistant";

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
        var apiKey = section["OpenAI:ApiKey"];
        var model = section["OpenAI:Model"];

        if (string.Equals(provider, "Fake", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAssistantProvider, FakeAssistantProvider>();
        }
        else if (string.Equals(provider, "OpenAI", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(apiKey)
            && !string.IsNullOrWhiteSpace(model))
        {
            services.AddSingleton<IAssistantProvider>(_ =>
                new OpenAIAssistantProvider(OpenAIAssistantProvider.CreateClient(apiKey), model));
        }
        else
        {
            services.AddSingleton<IAssistantProvider, UnavailableAssistantProvider>();
        }

        services.AddRateLimiter(options =>
        {
            options.AddPolicy(RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty,
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = QuestionsPerWindow,
                    Window = QuestionWindow,
                    QueueLimit = 0,
                }));

            options.OnRejected = async (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString(System.Globalization.CultureInfo.InvariantCulture);
                }

                await Results.Problem(
                        title: "Too many questions",
                        detail: "You've asked a lot in the last few minutes. Wait a little, then try again.",
                        statusCode: StatusCodes.Status429TooManyRequests,
                        extensions: new Dictionary<string, object?> { ["code"] = RateLimitedCode })
                    .ExecuteAsync(context.HttpContext);
            };
        });

        return services;
    }
}
