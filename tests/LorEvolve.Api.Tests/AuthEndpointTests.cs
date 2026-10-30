using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.Auth;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Covers the registration and sign-in surface. Credentials here are obviously synthetic
/// and exist only inside the throwaway in-memory database.
/// </summary>
public sealed class AuthEndpointTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task Registration_creates_the_account_and_signs_the_user_in()
    {
        using var client = _factory.CreateClient();

        var response = await Register(client, "registrant");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthUserResponse>();
        Assert.NotNull(body);
        Assert.Equal("registrant", body.Username);
        Assert.Equal("registrant@example.test", body.Email);
        Assert.NotEmpty(body.Id);

        // The registration response doubles as a sign-in.
        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task Registration_rejects_a_duplicate_username()
    {
        using var client = _factory.CreateClient();
        await Register(client, "duplicateuser");

        using var second = _factory.CreateClient();
        var response = await Register(second, "duplicateuser", "different@example.test");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("username", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Registration_rejects_a_duplicate_email()
    {
        using var client = _factory.CreateClient();
        await Register(client, "firstclaimant", "shared@example.test");

        using var second = _factory.CreateClient();
        var response = await Register(second, "secondclaimant", "shared@example.test");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("email", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Login_succeeds_with_the_username()
    {
        using var registrar = _factory.CreateClient();
        await Register(registrar, "byusername");

        using var client = _factory.CreateClient();
        var response = await Login(client, "byusername", Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthUserResponse>();
        Assert.Equal("byusername", body?.Username);
    }

    [Fact]
    public async Task Login_succeeds_with_the_email_address()
    {
        using var registrar = _factory.CreateClient();
        await Register(registrar, "byemail");

        using var client = _factory.CreateClient();
        var response = await Login(client, "byemail@example.test", Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AuthUserResponse>();
        Assert.Equal("byemail", body?.Username);
    }

    [Fact]
    public async Task Login_rejects_an_incorrect_password()
    {
        using var registrar = _factory.CreateClient();
        await Register(registrar, "wrongpassword");

        using var client = _factory.CreateClient();
        var response = await Login(client, "wrongpassword", "Not-the-password-9!");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Login_failure_does_not_reveal_whether_the_account_exists()
    {
        using var registrar = _factory.CreateClient();
        await Register(registrar, "enumerationtarget");

        using var known = _factory.CreateClient();
        var wrongPassword = await Login(known, "enumerationtarget", "Not-the-password-9!");

        using var unknown = _factory.CreateClient();
        var noSuchUser = await Login(unknown, "nobodyhere", "Not-the-password-9!");

        Assert.Equal(noSuchUser.StatusCode, wrongPassword.StatusCode);
        Assert.Equal(
            await noSuchUser.Content.ReadAsStringAsync(),
            await wrongPassword.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_locked_out_account_answers_like_one_that_does_not_exist()
    {
        using var registrar = _factory.CreateClient();
        await Register(registrar, "lockouttarget");

        using var attacker = _factory.CreateClient();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            await Login(attacker, "lockouttarget", "Not-the-password-9!");
        }

        // Locked now: even the right password is refused, and nothing tells this account from a made-up one (N-3).
        var locked = await Login(attacker, "lockouttarget", Password);
        var noSuchUser = await Login(attacker, "nobodyhere", "Not-the-password-9!");

        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Equal(noSuchUser.StatusCode, locked.StatusCode);
        Assert.Equal(await noSuchUser.Content.ReadAsStringAsync(), await locked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Me_requires_authentication()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_returns_the_authenticated_user()
    {
        using var client = _factory.CreateClient();
        await Register(client, "currentuser");

        var body = await client.GetFromJsonAsync<AuthUserResponse>("/api/auth/me");

        Assert.NotNull(body);
        Assert.Equal("currentuser", body.Username);
        Assert.Equal("currentuser@example.test", body.Email);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        using var client = _factory.CreateClient();
        await Register(client, "signingout");

        var logout = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task Logout_requires_authentication()
    {
        using var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/auth/logout", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static Task<HttpResponseMessage> Register(HttpClient client, string username, string? email = null) =>
        client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterRequest(username, email ?? $"{username}@example.test", Password));

    private static Task<HttpResponseMessage> Login(HttpClient client, string usernameOrEmail, string password) =>
        client.PostAsJsonAsync("/api/auth/login", new LoginRequest(usernameOrEmail, password));
}
