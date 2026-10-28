using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Feedback;

public sealed record FeedbackRequest(FeedbackKind? Kind, string? Text, string? Page);

/// <summary>One report as an Admin reads it: the sender by username, never their email.</summary>
public sealed record FeedbackReportView(
    Guid Id,
    FeedbackKind Kind,
    string Text,
    string? Page,
    DateTime CreatedAt,
    string UserId,
    string? UserName);

public sealed record FeedbackReportPage(IReadOnlyList<FeedbackReportView> Items, int Page, int PageSize, int TotalCount);

/// <summary>
/// Bug reports and feature requests: any signed-in account sends one, only an Admin reads them (<see cref="AdminSetup.Policy"/>).
/// </summary>
public static class FeedbackEndpoints
{
    public const int PageSize = 50;

    /// <summary>How many reports one account may send in an hour. A typo resent is fine; a loop is not.</summary>
    public const int HourlyLimit = 20;

    public static IEndpointRouteBuilder MapFeedbackEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/feedback", SendAsync).WithTags("Feedback").WithName("SendFeedback").RequireAuthorization();
        endpoints.MapGet("/api/admin/feedback", ListAsync).WithTags("Admin").WithName("ListAdminFeedback").RequireAuthorization(AdminSetup.Policy);
        return endpoints;
    }

    private static async Task<IResult> SendAsync(
        [FromBody] FeedbackRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var userId = principal.RequireUserId();
        var text = request.Text?.Trim();
        var errors = new Dictionary<string, string[]>();

        if (request.Kind is not { } kind || !Enum.IsDefined(kind))
        {
            errors["kind"] = ["Choose a bug or a feature request."];
        }

        if (string.IsNullOrEmpty(text))
        {
            errors["text"] = ["Describe it in a few words."];
        }
        else if (text.Length > FeedbackReport.TextMaxLength)
        {
            errors["text"] = [$"Keep it under {FeedbackReport.TextMaxLength} characters."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow().UtcDateTime;
        if (await db.FeedbackReports.CountAsync(report => report.UserId == userId && report.CreatedAt > now.AddHours(-1), cancellationToken) >= HourlyLimit)
        {
            return Results.Problem(
                title: "Too many reports",
                detail: "That is a lot of reports in one hour. Try again later.",
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        db.FeedbackReports.Add(new FeedbackReport
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Kind = request.Kind!.Value,
            Text = text!,
            Page = PathOnly(request.Page),
            CreatedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> ListAsync(LorEvolveDbContext db, CancellationToken cancellationToken, [FromQuery] int page = 1)
    {
        page = Math.Max(page, 1);
        var skip = (int)Math.Min((long)(page - 1) * PageSize, int.MaxValue);
        var total = await db.FeedbackReports.CountAsync(cancellationToken);

        var items = await db.FeedbackReports.AsNoTracking()
            .OrderByDescending(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .Skip(skip)
            .Take(PageSize)
            .Select(report => new FeedbackReportView(
                report.Id,
                report.Kind,
                report.Text,
                report.Page,
                report.CreatedAt,
                report.UserId,
                db.Users.Where(user => user.Id == report.UserId).Select(user => user.UserName).FirstOrDefault()))
            .ToListAsync(cancellationToken);

        return Results.Ok(new FeedbackReportPage(items, page, PageSize, total));
    }

    /// <summary>A same-site path, cut to fit, with no query or fragment - where the person was, and nothing they typed into it.</summary>
    private static string? PathOnly(string? page)
    {
        if (string.IsNullOrWhiteSpace(page) || !page.StartsWith('/') || page.StartsWith("//", StringComparison.Ordinal))
        {
            return null;
        }

        var path = page.Split('?', '#')[0];
        return path.Length > FeedbackReport.PageMaxLength ? path[..FeedbackReport.PageMaxLength] : path;
    }
}
