using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Email;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// An Admin's sign-up link sent by email: only with email and the public origin configured, only by an Admin, as one
/// request to Resend whose link is the configured origin's register page with a token for that address alone. Nothing
/// leaves the test: Resend is a handler that records what it was sent.
/// </summary>
public sealed class SignUpEmailTests
{
    private const string Origin = "https://lorevolve.example";

    [Fact]
    public async Task An_admin_emails_a_sign_up_link_built_on_the_configured_origin()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: true);
        var (admin, _) = await Admin(api);

        var response = await admin.PostAsJsonAsync("/api/admin/signup-links/email", new SignUpLinkRequest(" New.Person@Example.test "));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("token", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

        var sent = Assert.Single(resend.Bodies);
        using var body = JsonDocument.Parse(sent);
        Assert.Equal("LorEvolve <noreply@lorevolve.example>", body.RootElement.GetProperty("from").GetString());
        Assert.Equal("New.Person@Example.test", body.RootElement.GetProperty("to")[0].GetString());
        Assert.Equal(SignUpEmail.Subject, body.RootElement.GetProperty("subject").GetString());
        var text = body.RootElement.GetProperty("text").GetString()!;
        Assert.Contains($"{Origin}/register?invite=", text);
        Assert.Contains($"{Origin}/register?invite=", body.RootElement.GetProperty("html").GetString()!);
        Assert.Equal("Bearer", resend.Authorization?.Scheme);
        Assert.Equal("re_test_key", resend.Authorization?.Parameter);

        // The link's token names that address, and only that one.
        var token = Uri.UnescapeDataString(text.Split("invite=")[1].Split('\n')[0].Trim());
        var read = SignUpLinks.Read(api.Services.GetRequiredService<IDataProtectionProvider>(), token);
        Assert.Equal("NEW.PERSON@EXAMPLE.TEST", read?.NormalizedEmail);
    }

    [Fact]
    public async Task Without_email_settings_nothing_is_sent_and_the_admin_is_told()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: false);
        var (admin, _) = await Admin(api);

        var response = await admin.PostAsJsonAsync("/api/admin/signup-links/email", new SignUpLinkRequest("someone@example.test"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains(AdminEndpoints.EmailOffCode, await response.Content.ReadAsStringAsync());
        Assert.Empty(resend.Bodies);
    }

    [Fact]
    public async Task A_refusal_from_the_sender_is_said_and_a_member_cannot_send_at_all()
    {
        var resend = new RecordingHandler(HttpStatusCode.UnprocessableEntity);
        using var api = Host(resend, configured: true);
        var (admin, _) = await Admin(api);

        var refused = await admin.PostAsJsonAsync("/api/admin/signup-links/email", new SignUpLinkRequest("someone@example.test"));
        Assert.Equal(HttpStatusCode.BadGateway, refused.StatusCode);
        Assert.Contains(AdminEndpoints.EmailFailedCode, await refused.Content.ReadAsStringAsync());

        var (member, _) = await Account(api, "signup-member");
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/admin/signup-links/email", new SignUpLinkRequest("x@example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/admin/signup-links/email", new SignUpLinkRequest("not an address"))).StatusCode);
        Assert.Single(resend.Bodies);
    }

    private static WebApplicationFactory<Program> Host(RecordingHandler resend, bool configured)
    {
        var settings = new Dictionary<string, string?>
        {
            ["PublicSite:Origin"] = Origin,
        };
        if (configured)
        {
            settings["Email:ApiKey"] = "re_test_key";
            settings["Email:From"] = "LorEvolve <noreply@lorevolve.example>";
        }

        return new LorEvolveApiFactory { Settings = settings }.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddHttpClient(AppEmail.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => resend)));
    }

    private static async Task<(HttpClient Client, string Id)> Admin(WebApplicationFactory<Program> api)
    {
        var (client, id) = await Account(api, "signup-admin");
        using var scope = api.Services.CreateScope();
        await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), id, CancellationToken.None);
        return (client, id);
    }

    private static async Task<(HttpClient Client, string Id)> Account(WebApplicationFactory<Program> api, string tag)
    {
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.PostAsJsonAsync("/api/auth/register", new Features.Auth.RegisterRequest($"user-{tag}", $"{tag}@example.test", PublishingTestClient.Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<Features.Auth.AuthUserResponse>())!.Id);
    }

    /// <summary>Resend, as far as a test needs it: records each request body and answers with one status.</summary>
    private sealed class RecordingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];

        public System.Net.Http.Headers.AuthenticationHeaderValue? Authorization { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            Authorization = request.Headers.Authorization;
            return new HttpResponseMessage(status) { Content = new StringContent("{\"id\":\"test\"}") };
        }
    }
}
