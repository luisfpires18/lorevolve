using System.Diagnostics;

namespace LorEvolve.Api.Hosting;

/// <summary>
/// What a request answers when it fails for a reason nobody wrote a refusal for - a locked SQLite file, a broken
/// connection, a bug (issue 55, W2). Without this, outside Development that is an empty 500, and a tester's report cannot
/// be matched to anything the server logged.
///
/// The answer is RFC 7807, the shape every refusal already has and <c>lib/api.ts</c> already reads, with the request's
/// <c>traceId</c> and nothing about what failed. The exception itself is logged by the exception-handler middleware, whose
/// log scope carries the same trace id where scopes are written (<c>Logging:Console:IncludeScopes</c> on DEV).
///
/// Only unhandled failures are touched. <c>AddProblemDetails</c> would do the same job, but it also stamps a trace id
/// onto every refusal the API returns, changing shapes clients and tests pin.
/// </summary>
public static class UnhandledFailure
{
    /// <summary>Outside Development only: Development keeps the developer exception page.</summary>
    public static WebApplication UseLorEvolveUnhandledFailures(this WebApplication app)
    {
        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler(new ExceptionHandlerOptions { ExceptionHandler = WriteAsync });
        }

        return app;
    }

    private static Task WriteAsync(HttpContext context) =>
        Results.Problem(
            title: "Something went wrong",
            detail: "LorEvolve could not finish that. Try again in a moment.",
            statusCode: StatusCodes.Status500InternalServerError,
            extensions: new Dictionary<string, object?> { ["traceId"] = Activity.Current?.Id ?? context.TraceIdentifier })
        .ExecuteAsync(context);
}
