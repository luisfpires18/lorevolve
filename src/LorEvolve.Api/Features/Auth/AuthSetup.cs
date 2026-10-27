using LorEvolve.Api.Data;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

namespace LorEvolve.Api.Features.Auth;

/// <summary>Registers ASP.NET Core Identity with cookie authentication.</summary>
public static class AuthSetup
{
    /// <summary>Cookie lifetime. Sliding, so an active session is not interrupted.</summary>
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(7);

    public static IServiceCollection AddLorEvolveAuth(this IServiceCollection services, IHostEnvironment environment)
    {
        services.AddAuthentication(IdentityConstants.ApplicationScheme)
            .AddIdentityCookies();

        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "lorevolve.session";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;

            // The SPA is served same-origin - through the Vite proxy in development, out of the
            // API's own wwwroot once deployed - so the cookie can stay Strict.
            //
            // Secure is the default and only the two hosts that deliberately run plain HTTP
            // relax it: development, and the test host. Demanding Secure there would silently
            // drop the cookie. Every deployed environment is served over HTTPS, so it is the
            // deployment that has to opt out of plain HTTP, not the other way round.
            var servesPlainHttp = environment.IsDevelopment() || environment.IsEnvironment("Testing");
            options.Cookie.SecurePolicy = servesPlainHttp
                ? CookieSecurePolicy.SameAsRequest
                : CookieSecurePolicy.Always;

            options.ExpireTimeSpan = SessionLifetime;
            options.SlidingExpiration = true;

            // This is an API, not a server-rendered app: answer with status codes rather than
            // redirecting the fetch call to a login page that does not exist server-side.
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            // Every request: a blocked account, or a session ended by one, is signed out at once (#40).
            options.Events.OnValidatePrincipal = AccountSessions.ValidateAsync;

            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        services.AddIdentityCore<LorEvolveUser>(options =>
            {
                // Deliberately simple for development, without switching protections off.
                options.Password.RequiredLength = 8;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;

                options.User.RequireUniqueEmail = true;

                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddEntityFrameworkStores<LorEvolveDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders();

        services.AddAuthorization();

        return services;
    }
}
