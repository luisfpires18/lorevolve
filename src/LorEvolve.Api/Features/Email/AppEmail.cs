using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace LorEvolve.Api.Features.Email;

/// <summary>One email: the address it goes to, its subject, and its body as HTML and as plain text.</summary>
public sealed record AppEmailMessage(string To, string Subject, string Html, string Text);

/// <summary>
/// The app's own email, sent as <c>Email:From</c> (such as <c>LorEvolve &lt;noreply@lorevolve.com&gt;</c>) through
/// Resend's web API with <c>Email:ApiKey</c>, a sending-only key kept in the host's settings and never in the repository.
///
/// <para><b>Off until configured.</b> Without both settings nothing is sent and <see cref="IsConfigured"/> is false, so a
/// local run or a test never mails anyone. One HTTPS call per email, no SMTP and no library.</para>
///
/// <para><b>Says nothing it should not.</b> A failure is logged by status code only: never the address, the subject,
/// the body or the key.</para>
/// </summary>
public sealed partial class AppEmail(IHttpClientFactory clients, IConfiguration configuration, ILogger<AppEmail> logger)
{
    public const string SectionName = "Email";

    public const string HttpClientName = "Resend";

    private string? ApiKey => configuration[$"{SectionName}:ApiKey"]?.Trim() is { Length: > 0 } key ? key : null;

    private string? From => configuration[$"{SectionName}:From"]?.Trim() is { Length: > 0 } from ? from : null;

    public bool IsConfigured => ApiKey is not null && From is not null;

    /// <summary>Sends one email. False when not configured or when Resend refuses or cannot be reached.</summary>
    public async Task<bool> SendAsync(AppEmailMessage message, CancellationToken cancellationToken)
    {
        if (ApiKey is not { } key || From is not { } from)
        {
            return false;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails")
        {
            Content = JsonContent.Create(new
            {
                from,
                to = new[] { message.To },
                subject = message.Subject,
                html = message.Html,
                text = message.Text,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);

        try
        {
            using var response = await clients.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            LogRefused(logger, (int)response.StatusCode);
            return false;
        }
        catch (HttpRequestException)
        {
            LogUnreachable(logger);
            return false;
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            LogUnreachable(logger);
            return false;
        }
    }

    public static IServiceCollection AddAppEmail(IServiceCollection services)
    {
        services.AddHttpClient(HttpClientName, client =>
        {
            client.BaseAddress = new Uri("https://api.resend.com/");
            client.Timeout = TimeSpan.FromSeconds(15);
        });
        services.AddSingleton<AppEmail>();
        return services;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Email was refused by the sender ({Status}).")]
    private static partial void LogRefused(ILogger logger, int status);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Email could not reach the sender.")]
    private static partial void LogUnreachable(ILogger logger);
}
