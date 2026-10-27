using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Reading;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Assistant;

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
/// <b>Failures in LorEvolve's words.</b> Not set up is 503 <see cref="UnavailableCode"/>; a provider that failed, refused or
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

    /// <summary>The request mode in which the assistant may stage a proposal for review (ADR 0047).</summary>
    public const string ProposeMode = "propose";

    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/assistant")
            .WithTags("Assistant")
            .RequireAuthorization();

        group.MapGet("/", StatusAsync).WithName("GetAssistantStatus");
        group.MapPost("/", AskAsync).WithName("AskAssistant").WithMetadata(new AssistantQuestionMetadata());

        // The signed-in account's own allowance, read from the session alone like the rest of /api/profile.
        endpoints.MapGet("/api/profile/assistant-usage", (ClaimsPrincipal principal, AssistantAllowance allowance) =>
                Results.Ok(allowance.Read(principal.RequireUserId())))
            .WithTags("Assistant")
            .WithName("GetAssistantUsage")
            .RequireAuthorization();

        return endpoints;
    }

    /// <summary>
    /// Counts each question against the asking account's allowance (ADR 0045). Runs after authorization and before the
    /// endpoint, so the body has not been read yet: a question counts whatever happens next - a body that is not JSON, a
    /// refused question, an outsider's 404, a failed answer. Only endpoints marked <see cref="AssistantQuestionMetadata"/>
    /// are counted, and only for a signed-in account; one past the allowance is refused with how long until the window
    /// ends, and is not counted.
    /// </summary>
    public static IApplicationBuilder UseAssistantAllowance(this IApplicationBuilder app) =>
        app.Use(async (http, next) =>
        {
            if (http.GetEndpoint()?.Metadata.GetMetadata<AssistantQuestionMetadata>() is null
                || http.User.Identity?.IsAuthenticated != true)
            {
                await next(http);
                return;
            }

            var allowance = http.RequestServices.GetRequiredService<AssistantAllowance>();
            if (allowance.TryTake(http.User.RequireUserId()) is not { } wait)
            {
                await next(http);
                return;
            }

            http.Response.Headers.RetryAfter = ((int)Math.Ceiling(wait.TotalSeconds)).ToString(System.Globalization.CultureInfo.InvariantCulture);
            await Problem(
                    StatusCodes.Status429TooManyRequests,
                    AssistantSetup.RateLimitedCode,
                    "Too many questions",
                    "You've asked a lot in the last few minutes. Wait a little, then try again.")
                .ExecuteAsync(http);
        });

    private static async Task<IResult> StatusAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
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
        LorEvolveDbContext db,
        IAssistantProvider provider,
        ILoggerFactory loggers,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var (denied, role) = await UniverseAccess.AuthorizeAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        // Propose mode is the person's explicit request for changes (ADR 0047): asked for by name, and only by a role that can
        // propose any. Anything else is an ordinary, read-only question.
        var proposing = request.Mode switch
        {
            null or "ask" => (AssistantProposing?)null,
            ProposeMode when AiChanges.AiChangePermissions.MayStageAnything(role) =>
                new AssistantProposing(db, clock, universeId, principal.RequireUserId(), role),
            ProposeMode => null,
            _ => null,
        };

        if (request.Mode == ProposeMode && proposing is null)
        {
            return UniverseAccess.PermissionDenied();
        }

        if (request.Mode is not (null or "ask" or ProposeMode))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["mode"] = ["Ask a question, or propose changes."] });
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
            return Problem(StatusCodes.Status503ServiceUnavailable, UnavailableCode, "Assistant not set up", "The assistant isn't set up on this LorEvolve yet.");
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

        var logger = loggers.CreateLogger("LorEvolve.Assistant");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(UniverseAssistant.Timeout);

        try
        {
            return Results.Ok(await UniverseAssistant.AskAsync(provider, db, universeId, universeName, messages, logger, timeout.Token, proposing));
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

/// <summary>Marks the one route whose requests are questions counted by <see cref="AssistantEndpoints.UseAssistantAllowance"/>.</summary>
public sealed class AssistantQuestionMetadata;
