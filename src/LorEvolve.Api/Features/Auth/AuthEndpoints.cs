using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Features.Auth;

/// <summary>Registration, login, logout, the current-user probe and forgot password (<see cref="PasswordReset"/>).</summary>
public static partial class AuthEndpoints
{
    /// <summary>
    /// One message for every failed sign-in, so the response cannot be used to tell a wrong password from an account that
    /// does not exist, or from one locked out by failed attempts: only real accounts lock, so a separate lockout answer
    /// would name them (N-3). The message mentions the lockout so a person who is locked out knows to wait or reset.
    /// </summary>
    internal const string InvalidCredentials =
        "That username or email and password combination is not correct, or there were too many attempts. Try again in a few minutes, or reset your password.";

    /// <summary>A correct password for a blocked account (#40).</summary>
    public const string BlockedCode = "account_blocked";

    private static readonly EmailAddressAttribute EmailValidator = new();

    /// <summary>
    /// A throwaway user carrying a hash of a value only this process ever sees. Verifying
    /// against it costs the same as a real password check, so an unknown identifier and a
    /// wrong password take the same time to answer.
    /// </summary>
    private static readonly LorEvolveUser TimingDecoy = new()
    {
        PasswordHash = new PasswordHasher<LorEvolveUser>().HashPassword(new LorEvolveUser(), Guid.NewGuid().ToString()),
    };

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth").WithTags("Auth");

        group.MapGet("/registration", (IConfiguration configuration) => Results.Ok(new RegistrationResponse(InviteOnly(configuration))))
            .WithName("GetRegistration");
        group.MapPost("/register", RegisterAsync).WithName("Register");
        group.MapPost("/login", LoginAsync).WithName("Login");
        group.MapPost("/logout", LogoutAsync).WithName("Logout").RequireAuthorization();
        group.MapGet("/me", GetCurrentUser).WithName("GetCurrentUser").RequireAuthorization();
        PasswordReset.Map(group);

        return endpoints;
    }

    /// <summary>Open sign-up refused while registration is invitation-only and the request carries no live invitation.</summary>
    public const string InviteOnlyCode = "registration_invite_only";

    /// <summary>
    /// <c>Registration:InviteOnly</c>: only someone holding a live universe invitation or an Admin's sign-up link may create an
    /// account, and only for the address it was made for. Off by default; accounts that exist are never affected.
    /// </summary>
    private static bool InviteOnly(IConfiguration configuration) => configuration.GetValue<bool>("Registration:InviteOnly");

    /// <summary>The address an invitation-only registration may use, or null when the token opens nothing now.</summary>
    private static async Task<string?> InvitedEmailAsync(
        string? token, IDataProtectionProvider protection, LorEvolveDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;

        if (SignUpLinks.Read(protection, token) is { } link)
        {
            return link.ExpiresAt > now ? link.NormalizedEmail : null;
        }

        if (InvitationClaims.Read(protection, token) is { } claim)
        {
            // Live and pending, as accepting would require: a revoked, answered or expired invitation opens nothing.
            var live = await db.UniverseInvitations.AnyAsync(
                invitation => invitation.Id == claim.InvitationId
                    && invitation.NormalizedEmail == claim.NormalizedEmail
                    && invitation.ExpiresAt > now,
                cancellationToken);
            return live ? claim.NormalizedEmail : null;
        }

        return null;
    }

    private static async Task<IResult> RegisterAsync(
        [FromBody] RegisterRequest request,
        UserManager<LorEvolveUser> userManager,
        SignInManager<LorEvolveUser> signInManager,
        IConfiguration configuration,
        IDataProtectionProvider protection,
        LorEvolveDbContext db,
        TimeProvider clock,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var log = Log(loggers);
        string? invitedEmail = null;
        if (InviteOnly(configuration))
        {
            invitedEmail = await InvitedEmailAsync(request.InviteToken, protection, db, clock, cancellationToken);
            if (invitedEmail is null)
            {
                return Results.Problem(
                    title: "Registration is by invitation",
                    detail: "LorEvolve is invitation-only for now. Open the invitation link you were sent to create your account.",
                    statusCode: StatusCodes.Status403Forbidden,
                    extensions: new Dictionary<string, object?> { ["code"] = InviteOnlyCode });
            }
        }

        var username = request.Username?.Trim() ?? string.Empty;
        var email = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(username))
        {
            errors["username"] = ["Choose a username."];
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            errors["email"] = ["Enter your email address."];
        }
        else if (EmailValidator.GetValidationResult(email, new ValidationContext(email)) != ValidationResult.Success)
        {
            errors["email"] = ["Enter a valid email address."];
        }

        if (string.IsNullOrEmpty(password))
        {
            errors["password"] = ["Choose a password."];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        if (invitedEmail is not null && userManager.NormalizeEmail(email) != invitedEmail)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["Use the email address your invitation was sent to."],
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        if (await userManager.FindByNameAsync(username) is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["username"] = ["That username is already taken."],
            });
        }

        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["That email address is already registered."],
            });
        }

        var user = new LorEvolveUser { UserName = username, Email = email };

        IdentityResult result;
        try
        {
            result = await userManager.CreateAsync(user, password);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            // Two registrations for the same username or email can pass the checks above
            // concurrently; the unique indexes settle it and one of them lands here.
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["request"] = ["Those details were just taken. Try again."],
            });
        }

        if (!result.Succeeded)
        {
            return Results.ValidationProblem(ToValidationErrors(result));
        }

        await signInManager.SignInAsync(user, isPersistent: true);
        AccountCreated(log, user.Id, user.UserName!, invitedEmail is not null);
        return Results.Ok(ToResponse(user));
    }

    private static async Task<IResult> LoginAsync(
        [FromBody] LoginRequest request,
        UserManager<LorEvolveUser> userManager,
        SignInManager<LorEvolveUser> signInManager,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var log = Log(loggers);
        var identifier = request.UsernameOrEmail?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrEmpty(password))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["credentials"] = [InvalidCredentials],
            });
        }

        cancellationToken.ThrowIfCancellationRequested();

        // An identifier containing "@" is treated as an email first, then falls back to a
        // username, so a username that happens to contain "@" still works.
        var user = identifier.Contains('@', StringComparison.Ordinal)
            ? await userManager.FindByEmailAsync(identifier) ?? await userManager.FindByNameAsync(identifier)
            : await userManager.FindByNameAsync(identifier) ?? await userManager.FindByEmailAsync(identifier);

        if (user is null)
        {
            // Burn the same work a real verification would, so response time does not
            // disclose whether the account exists.
            userManager.PasswordHasher.VerifyHashedPassword(
                TimingDecoy, TimingDecoy.PasswordHash!, password);
            // What was typed is never written down: it may be an email address, or a password in the wrong field.
            SignInRefusedUnknown(log);
            return InvalidCredentialsProblem();
        }

        // The password first, then the block (#40): only someone who knows the password learns the account is blocked,
        // and a blocked account never gets a session.
        // Locked out answers exactly like a wrong password (InvalidCredentials says why), in the same time: Identity
        // refuses a locked account before hashing, so the decoy's work is done instead.
        var signIn = await signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        if (signIn.IsLockedOut)
        {
            userManager.PasswordHasher.VerifyHashedPassword(TimingDecoy, TimingDecoy.PasswordHash!, password);
        }

        if (!signIn.Succeeded)
        {
            SignInRefused(log, user.Id, user.UserName!, signIn.IsLockedOut ? "locked out" : "wrong password");
            return InvalidCredentialsProblem();
        }

        if (user.BlockedAt is not null)
        {
            SignInRefused(log, user.Id, user.UserName!, "blocked");
            return Results.Problem(
                title: "Account blocked",
                detail: "This account has been blocked by a LorEvolve administrator.",
                statusCode: StatusCodes.Status403Forbidden,
                extensions: new Dictionary<string, object?> { ["code"] = BlockedCode });
        }

        await signInManager.SignInAsync(user, isPersistent: true);
        SignedIn(log, user.Id, user.UserName!);
        return Results.Ok(ToResponse(user));
    }

    /// <summary>
    /// Account events in the server's log (Azure's Log Stream), one line each, under one category so they can be filtered:
    /// the account's id and username, never its email address, a password or what was typed to sign in.
    /// </summary>
    private static ILogger Log(ILoggerFactory loggers) => loggers.CreateLogger("LorEvolve.Auth");

    [LoggerMessage(Level = LogLevel.Information, Message = "Account created: {UserId} ({UserName}), by invitation: {Invited}.")]
    private static partial void AccountCreated(ILogger logger, string userId, string userName, bool invited);

    [LoggerMessage(Level = LogLevel.Information, Message = "Signed in: {UserId} ({UserName}).")]
    private static partial void SignedIn(ILogger logger, string userId, string userName);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Sign-in refused for {UserId} ({UserName}): {Reason}.")]
    private static partial void SignInRefused(ILogger logger, string userId, string userName, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Sign-in refused: no account matches what was typed.")]
    private static partial void SignInRefusedUnknown(ILogger logger);

    private static async Task<IResult> LogoutAsync(SignInManager<LorEvolveUser> signInManager)
    {
        await signInManager.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetCurrentUser(
        ClaimsPrincipal principal,
        UserManager<LorEvolveUser> userManager)
    {
        var user = await userManager.GetUserAsync(principal);
        return user is null ? Results.Unauthorized() : Results.Ok(ToResponse(user));
    }

    private static IResult InvalidCredentialsProblem() =>
        Results.Problem(
            title: "Sign-in failed",
            detail: InvalidCredentials,
            statusCode: StatusCodes.Status401Unauthorized);

    private static AuthUserResponse ToResponse(LorEvolveUser user) =>
        new(user.Id, user.UserName ?? string.Empty, user.Email ?? string.Empty, user.PlatformRole == Admin.PlatformRole.Admin);

    internal static Dictionary<string, string[]> ToValidationErrors(IdentityResult result)
    {
        var errors = new Dictionary<string, List<string>>();

        foreach (var error in result.Errors)
        {
            // Identity codes are prefixed by the field they concern (PasswordTooShort, ...).
            var key = error.Code.StartsWith("Password", StringComparison.Ordinal) ? "password"
                : error.Code.Contains("Email", StringComparison.Ordinal) ? "email"
                : error.Code.Contains("UserName", StringComparison.Ordinal) ? "username"
                : "request";

            if (!errors.TryGetValue(key, out var list))
            {
                list = [];
                errors[key] = list;
            }

            list.Add(error.Description);
        }

        return errors.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray());
    }
}
