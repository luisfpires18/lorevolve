using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenIddict.Abstractions;

namespace LorEvolve.Api.Features.Admin;

/// <summary>
/// The Admin workspace's API (#40), every route behind <see cref="AdminSetup.Policy"/>: the Main dashboard's counts, the
/// Users grid and an account's details, and the only two account actions V1 has - block and unblock a Member.
///
/// <para><b>Privacy.</b> Nothing here reads a universe's content, its name or anything inside it, and an Admin gains no
/// universe role: counts only. No email, password, token or photo of another account leaves this API.</para>
///
/// <para><b>Block.</b> One conditional update - a Member, not already blocked - so two Admins, or two presses, cannot both
/// apply it, and an Admin account is never a target (no self-lockout, never the last Admin). The same transaction rotates the
/// account's security stamp, which ends every session it has at its next request (<see cref="Auth.AccountSessions"/>),
/// revokes every AI connection it made and writes the audit record. Unblock is the mirror, and brings back neither.</para>
/// </summary>
public static class AdminEndpoints
{
    public const string AdminTargetCode = "admin_target";

    public const string StateChangedCode = "admin_state_changed";

    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization(AdminSetup.Policy);
        group.MapGet("/overview", OverviewAsync).WithName("GetAdminOverview");
        group.MapGet("/users", ListUsersAsync).WithName("ListAdminUsers");
        group.MapGet("/users/{userId}", GetUserAsync).WithName("GetAdminUser");
        group.MapPost("/users/{userId}/block", BlockAsync).WithName("BlockAdminUser");
        group.MapPost("/users/{userId}/unblock", UnblockAsync).WithName("UnblockAdminUser");
        group.MapPost("/signup-links", SignUpLink).WithName("CreateAdminSignUpLink");
        return endpoints;
    }

    private static async Task<IResult> OverviewAsync(LorEvolveDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var firstMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1 - AdminLimits.TrendMonths);

        // Aggregates only: every figure is one COUNT or SUM, whatever the size of the service. No row is loaded.
        var accounts = await db.Users.CountAsync(cancellationToken);
        var admins = await db.Users.CountAsync(user => user.PlatformRole == PlatformRole.Admin, cancellationToken);
        var blocked = await db.Users.CountAsync(user => user.BlockedAt != null, cancellationToken);
        var universes = await db.Universes.CountAsync(cancellationToken);
        var publicUniverses = await db.Universes.CountAsync(universe => universe.Visibility == UniverseVisibility.Public, cancellationToken);
        var collaborations = await db.UniverseMemberships.CountAsync(cancellationToken);
        var loreImages = await db.EntityImages.SumAsync(image => (long?)image.ByteSize, cancellationToken) ?? 0;
        var appearanceImages = await db.EntityAppearanceImages.SumAsync(image => (long?)image.ByteSize, cancellationToken) ?? 0;
        var connectedApps = await db.McpConnections.CountAsync(cancellationToken);

        var created = await db.Universes
            .Where(universe => universe.CreatedAt >= firstMonth)
            .GroupBy(universe => new { universe.CreatedAt.Year, universe.CreatedAt.Month })
            .Select(month => new { month.Key.Year, month.Key.Month, Count = month.Count() })
            .ToListAsync(cancellationToken);

        // Every month in the window, a quiet one as zero rather than missing.
        var trend = Enumerable.Range(0, AdminLimits.TrendMonths)
            .Select(offset => firstMonth.AddMonths(offset))
            .Select(month => new MonthCount(
                month.Year,
                month.Month,
                created.FirstOrDefault(row => row.Year == month.Year && row.Month == month.Month)?.Count ?? 0))
            .ToList();

        return Results.Ok(new AdminOverview(
            now, accounts, admins, blocked, universes, publicUniverses, collaborations,
            loreImages + appearanceImages, connectedApps, trend));
    }

    private static async Task<IResult> ListUsersAsync(
        LorEvolveDbContext db,
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1)
    {
        page = Math.Max(page, 1);
        var query = db.Users.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            query = query.Where(user => EF.Functions.Like(user.UserName!, pattern, "\\")
                || (user.PublicDisplayName != null && EF.Functions.Like(user.PublicDisplayName, pattern, "\\")));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (int)Math.Min((long)(page - 1) * AdminLimits.PageSize, int.MaxValue);

        // The id breaks ties, so a page never repeats or skips an account.
        var items = await query
            .OrderBy(user => user.NormalizedUserName)
            .ThenBy(user => user.Id)
            .Skip(skip)
            .Take(AdminLimits.PageSize)
            .Select(user => new
            {
                user.Id,
                user.UserName,
                user.PublicDisplayName,
                user.PlatformRole,
                IsBlocked = user.BlockedAt != null,
            })
            .ToListAsync(cancellationToken);

        var totalPages = totalCount == 0 ? 0 : (int)Math.Ceiling(totalCount / (double)AdminLimits.PageSize);
        return Results.Ok(new AdminUserPage(
            [.. items.Select(user => new AdminUserSummary(
                user.Id, user.UserName ?? string.Empty, user.PublicDisplayName, user.PlatformRole.ToString(), user.IsBlocked))],
            page,
            AdminLimits.PageSize,
            totalCount,
            totalPages));
    }

    private static async Task<IResult> GetUserAsync(string userId, LorEvolveDbContext db, CancellationToken cancellationToken) =>
        await DetailAsync(db, userId, cancellationToken) is { } detail ? Results.Ok(detail) : Results.NotFound();

    /// <summary>
    /// A sign-up link for one address, for someone who has no universe to be invited into: while registration is
    /// invitation-only it lets that address, and only that one, create an account for <see cref="SignUpLinks.Lifetime"/>.
    /// Stateless; an address registers once, so the link opens one account.
    /// </summary>
    private static IResult SignUpLink(
        [FromBody] SignUpLinkRequest request,
        IDataProtectionProvider protection,
        UserManager<LorEvolveUser> userManager,
        TimeProvider clock)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        if (EmailValidator.GetValidationResult(email, new ValidationContext(email)) != ValidationResult.Success || email.Length == 0)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Enter a valid email address."] });
        }

        var expiresAt = clock.GetUtcNow().UtcDateTime + SignUpLinks.Lifetime;
        return Results.Ok(new SignUpLinkResponse(SignUpLinks.Issue(protection, userManager.NormalizeEmail(email), expiresAt), expiresAt));
    }

    private static readonly EmailAddressAttribute EmailValidator = new();

    private static async Task<IResult> BlockAsync(
        string userId,
        [FromBody] AdminActionRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        IOpenIddictAuthorizationManager authorizations,
        IOpenIddictTokenManager tokens,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (ReasonProblem(request, out var reason) is { } invalid)
        {
            return invalid;
        }

        if (await RoleAsync(db, userId, cancellationToken) is not { } role)
        {
            return Results.NotFound();
        }

        if (role == PlatformRole.Admin)
        {
            return Problem(
                AdminTargetCode,
                "Admin accounts cannot be blocked.",
                "Only Member accounts can be blocked, so no Admin can lock out themselves or the last Admin.");
        }

        var now = clock.GetUtcNow().UtcDateTime;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var changed = await db.Users
            .Where(user => user.Id == userId && user.PlatformRole == PlatformRole.Member && user.BlockedAt == null)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(user => user.BlockedAt, now)
                    .SetProperty(user => user.SecurityStamp, Guid.NewGuid().ToString("N"))
                    .SetProperty(user => user.ConcurrencyStamp, Guid.NewGuid().ToString()),
                cancellationToken);
        if (changed == 0)
        {
            return StateChanged("This account is already blocked.");
        }

        foreach (var connection in await db.McpConnections.Where(row => row.UserId == userId).ToListAsync(cancellationToken))
        {
            await ConnectedAppEndpoints.RevokeAsync(db, authorizations, tokens, connection, cancellationToken);
        }

        await RecordAsync(db, principal.RequireUserId(), userId, AdminAction.Block, reason, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await DetailAsync(db, userId, cancellationToken));
    }

    private static async Task<IResult> UnblockAsync(
        string userId,
        [FromBody] AdminActionRequest request,
        ClaimsPrincipal principal,
        LorEvolveDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (ReasonProblem(request, out var reason) is { } invalid)
        {
            return invalid;
        }

        if (await RoleAsync(db, userId, cancellationToken) is null)
        {
            return Results.NotFound();
        }

        var now = clock.GetUtcNow().UtcDateTime;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var changed = await db.Users
            .Where(user => user.Id == userId && user.BlockedAt != null)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(user => user.BlockedAt, (DateTime?)null)
                    .SetProperty(user => user.ConcurrencyStamp, Guid.NewGuid().ToString()),
                cancellationToken);
        if (changed == 0)
        {
            return StateChanged("This account is not blocked.");
        }

        await RecordAsync(db, principal.RequireUserId(), userId, AdminAction.Unblock, reason, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(await DetailAsync(db, userId, cancellationToken));
    }

    private static Task<PlatformRole?> RoleAsync(LorEvolveDbContext db, string userId, CancellationToken cancellationToken) =>
        db.Users.Where(user => user.Id == userId).Select(user => (PlatformRole?)user.PlatformRole).FirstOrDefaultAsync(cancellationToken);

    private static async Task RecordAsync(
        LorEvolveDbContext db,
        string actorId,
        string targetId,
        AdminAction action,
        string reason,
        DateTime now,
        CancellationToken cancellationToken)
    {
        db.AdminAuditRecords.Add(new AdminAuditRecord
        {
            Id = Guid.NewGuid(),
            ActorUserId = actorId,
            TargetUserId = targetId,
            Action = action,
            Reason = reason,
            CreatedAt = now,
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private static async Task<AdminUserDetail?> DetailAsync(LorEvolveDbContext db, string userId, CancellationToken cancellationToken)
    {
        var account = await db.Users.AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new
            {
                user.Id,
                user.UserName,
                user.PublicDisplayName,
                user.PlatformRole,
                user.BlockedAt,
                Owned = db.Universes.Count(universe => universe.OwnerId == user.Id),
                Shared = db.UniverseMemberships.Count(membership => membership.UserId == user.Id),
                Apps = db.McpConnections.Count(connection => connection.UserId == user.Id),
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (account is null)
        {
            return null;
        }

        var storage = await AccountStorage.UsageAsync(db, userId, cancellationToken);
        var history = await db.AdminAuditRecords.AsNoTracking()
            .Where(record => record.TargetUserId == userId)
            .OrderByDescending(record => record.CreatedAt)
            .ThenByDescending(record => record.Id)
            .Take(AdminLimits.HistoryShown)
            .Select(record => new
            {
                record.Id,
                record.Action,
                record.Reason,
                record.CreatedAt,
                record.ActorUserId,
                ActorUsername = db.Users.Where(user => user.Id == record.ActorUserId).Select(user => user.UserName).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);

        return new AdminUserDetail(
            account.Id,
            account.UserName ?? string.Empty,
            account.PublicDisplayName,
            account.PlatformRole.ToString(),
            account.BlockedAt is not null,
            account.BlockedAt,
            account.Owned,
            account.Shared,
            storage?.UsedBytes ?? 0,
            storage?.QuotaBytes ?? 0,
            account.Apps,
            [.. history.Select(record => new AdminAuditEntry(
                record.Id, record.Action.ToString(), record.Reason, record.CreatedAt, record.ActorUserId, record.ActorUsername))]);
    }

    private static IResult? ReasonProblem(AdminActionRequest? request, out string reason)
    {
        reason = request?.Reason?.Trim() ?? string.Empty;
        string? error = reason.Length == 0 ? "Say why. The reason is kept in the audit record."
            : reason.Length > AdminLimits.ReasonMaxLength ? $"Keep the reason to {AdminLimits.ReasonMaxLength} characters."
            : null;
        return error is null ? null : Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = [error] });
    }

    /// <summary>Someone else changed the account first: nothing was done, and the client reloads it.</summary>
    private static IResult StateChanged(string detail) => Problem(StateChangedCode, "The account changed.", detail);

    private static IResult Problem(string code, string title, string detail) =>
        Results.Problem(
            title: title,
            detail: detail,
            statusCode: StatusCodes.Status409Conflict,
            extensions: new Dictionary<string, object?> { ["code"] = code });

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
