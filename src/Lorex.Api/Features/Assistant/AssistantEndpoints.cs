using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.Reading;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.Assistant;

/// <summary>
/// The universe assistant's two routes (ADR 0045): whether it can answer here, and one question.
///
/// <b>Read access, decided first.</b> Asking is reading, so every member may ask - owner, Editor, Reviewer, Viewer - and
/// anyone else gets the same 404 as a universe that does not exist, before the question is looked at, the universe read or
/// a model called. There is no public route.
///
/// <b>Nothing kept.</b> No question, answer or conversation is stored. The browser holds the conversation and sends what
/// the next answer needs; the universe is read afresh each time.
///
/// <b>Failures in Lorex's words.</b> Not set up is 503 <see cref="UnavailableCode"/>; a provider that failed, refused or
/// sent an unreadable answer is 502 <see cref="FailedCode"/>; one that is rate limiting this host is 503
/// <see cref="BusyCode"/>; too slow is 504 <see cref="TimedOutCode"/>; asking too often is 429
/// <see cref="AssistantSetup.RateLimitedCode"/>. The provider's own words are only ever logged.
/// </summary>
public static partial class AssistantEndpoints
{
    public const string UnavailableCode = "assistant_unavailable";
    public const string FailedCode = "assistant_failed";
    public const string BusyCode = "assistant_busy";
    public const string TimedOutCode = "assistant_timeout";

    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/assistant")
            .WithTags("Assistant")
            .RequireAuthorization();

        group.MapGet("/", StatusAsync).WithName("GetAssistantStatus");
        group.MapPost("/", AskAsync).WithName("AskAssistant").RequireRateLimiting(AssistantSetup.RateLimitPolicy);

        return endpoints;
    }

    private static async Task<IResult> StatusAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IAssistantProvider provider,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(new AssistantStatus(provider.IsConfigured));
    }

    private static async Task<IResult> AskAsync(
        Guid universeId,
        [FromBody] AssistantRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        IAssistantProvider provider,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        var question = request.Question?.Trim() ?? string.Empty;
        if (question.Length == 0 || question.Length > UniverseAssistant.QuestionLength)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["question"] = [question.Length == 0 ? "Type a question first." : "Keep your question under 1,000 characters."],
            });
        }

        if (!provider.IsConfigured)
        {
            return Problem(StatusCodes.Status503ServiceUnavailable, UnavailableCode, "Assistant not set up", "The assistant isn't set up on this LoreX yet.");
        }

        var universeName = await db.Universes.AsNoTracking()
            .Where(universe => universe.Id == universeId)
            .Select(universe => universe.Name)
            .FirstAsync(cancellationToken);

        // The conversation so far, as the browser sent it: its last few messages, each cut short, then the question.
        List<AssistantMessage> messages =
        [
            .. (request.History ?? [])
                .Where(message => Enum.IsDefined(message.Role) && !string.IsNullOrWhiteSpace(message.Text))
                .TakeLast(UniverseAssistant.HistoryMessages)
                .Select(message => new AssistantMessage(message.Role, ReadingText.Cut(message.Text, UniverseAssistant.HistoryMessageLength)!)),
            new AssistantMessage(AssistantRole.User, question),
        ];

        var logger = loggers.CreateLogger("Lorex.Assistant");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(UniverseAssistant.Timeout);

        try
        {
            return Results.Ok(await UniverseAssistant.AskAsync(provider, db, universeId, universeName, messages, logger, timeout.Token));
        }
        catch (AssistantProviderException exception)
        {
            LogProviderFailed(logger, exception.Failure, exception.Message, exception.InnerException);

            return exception.Failure switch
            {
                AssistantFailure.Busy => Problem(StatusCodes.Status503ServiceUnavailable, BusyCode, "Assistant busy", "The assistant is busy right now. Try again in a minute."),
                AssistantFailure.TimedOut => TimedOut(),
                _ => Problem(StatusCodes.Status502BadGateway, FailedCode, "No answer", "The assistant couldn't answer that. Try again."),
            };
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            LogTimedOut(logger, UniverseAssistant.Timeout);
            return TimedOut();
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Assistant provider failed ({Failure}): {Reason}")]
    private static partial void LogProviderFailed(ILogger logger, AssistantFailure failure, string reason, Exception? exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Assistant took longer than {Timeout} and was stopped.")]
    private static partial void LogTimedOut(ILogger logger, TimeSpan timeout);

    private static IResult TimedOut() =>
        Problem(StatusCodes.Status504GatewayTimeout, TimedOutCode, "Took too long", "That took too long to answer. Try again, or ask something narrower.");

    private static IResult Problem(int status, string code, string title, string detail) =>
        Results.Problem(
            title: title,
            detail: detail,
            statusCode: status,
            extensions: new Dictionary<string, object?> { ["code"] = code });
}
