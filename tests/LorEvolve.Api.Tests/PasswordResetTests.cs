using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Email;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Forgot password (#69): the same answer for any address, one email with a working link for a real one, a link that works
/// once and ends every session, nothing for a blocked account, and the Admin's send on an account's behalf. Resend is a
/// handler that records what it was sent.
/// </summary>
public sealed partial class PasswordResetTests
{
    private const string Origin = "https://lorevolve.example";

    private const string NewPassword = "brand-new-pass-9";

    [Fact]
    public async Task A_reset_link_works_once_and_ends_every_session()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: true);
        var (session, _) = await Account(api, "reset-owner");
        var anonymous = api.CreateClient();

        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(anonymous, " Reset-Owner@Example.test ")).StatusCode);
        var (userId, token, body) = await LinkAsync(resend, 1);
        Assert.Equal("reset-owner@example.test", body.RootElement.GetProperty("to")[0].GetString());
        Assert.Equal(PasswordResetEmail.Subject, body.RootElement.GetProperty("subject").GetString());

        // A refused password leaves the link usable.
        var weak = await Reset(anonymous, userId, token, "short");
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Contains("password", await weak.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.NoContent, (await Reset(anonymous, userId, token, NewPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.PostAsJsonAsync("/api/auth/login", new LoginRequest("user-reset-owner", NewPassword))).StatusCode);

        var reused = await Reset(api.CreateClient(), userId, token, "another-pass-9");
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
        Assert.Contains(PasswordReset.InvalidLink, await reused.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Any_address_gets_the_same_answer_and_asking_again_soon_sends_nothing_more()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: true);
        await Account(api, "reset-quiet");
        var client = api.CreateClient();

        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(client, "nobody@example.test")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(client, "reset-quiet@example.test")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(client, "reset-quiet@example.test")).StatusCode);
        await LinkAsync(resend, 1);
        await Task.Delay(300);
        Assert.Single(resend.Bodies);

        Assert.Equal(HttpStatusCode.BadRequest, (await Forgot(client, "not an address")).StatusCode);
    }

    [Fact]
    public async Task A_blocked_account_cannot_reset_and_nothing_is_sent_without_email_settings()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: true);
        var (admin, _) = await Admin(api, "reset-admin-a");
        var (_, memberId) = await Account(api, "reset-blocked");
        var client = api.CreateClient();

        await Forgot(client, "reset-blocked@example.test");
        var (userId, token, _) = await LinkAsync(resend, 1);
        (await admin.PostAsJsonAsync($"/api/admin/users/{memberId}/block", new AdminActionRequest("Testing."))).EnsureSuccessStatusCode();

        var refused = await Reset(client, userId, token, NewPassword);
        Assert.Contains(PasswordReset.InvalidLink, await refused.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/users/{memberId}/password-reset-email", null)).StatusCode);

        var quiet = new RecordingHandler(HttpStatusCode.OK);
        using var unconfigured = Host(quiet, configured: false);
        await Account(unconfigured, "reset-unset");
        Assert.Equal(HttpStatusCode.NoContent, (await Forgot(unconfigured.CreateClient(), "reset-unset@example.test")).StatusCode);
        await Task.Delay(300);
        Assert.Empty(quiet.Bodies);
    }

    [Fact]
    public async Task An_admin_emails_an_account_its_reset_link_and_the_send_is_recorded()
    {
        var resend = new RecordingHandler(HttpStatusCode.OK);
        using var api = Host(resend, configured: true);
        var (admin, adminId) = await Admin(api, "reset-admin-b");
        var (member, memberId) = await Account(api, "reset-member");

        var response = await admin.PostAsync($"/api/admin/users/{memberId}/password-reset-email", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("token", detail, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("reset-member@example.test", detail, StringComparison.OrdinalIgnoreCase);
        Assert.Contains(nameof(AdminAction.PasswordResetSent), detail);

        var (userId, _, body) = await LinkAsync(resend, 1);
        Assert.Equal(memberId, userId);
        Assert.Equal("reset-member@example.test", body.RootElement.GetProperty("to")[0].GetString());

        using (var scope = api.Services.CreateScope())
        {
            var record = await scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>().AdminAuditRecords.SingleAsync(row => row.TargetUserId == memberId);
            Assert.Equal(AdminAction.PasswordResetSent, record.Action);
            Assert.Equal(adminId, record.ActorUserId);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync("/api/admin/users/no-such-user/password-reset-email", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsync($"/api/admin/users/{adminId}/password-reset-email", null)).StatusCode);

        var quiet = new RecordingHandler(HttpStatusCode.OK);
        using var unconfigured = Host(quiet, configured: false);
        var (otherAdmin, _) = await Admin(unconfigured, "reset-admin-c");
        var (_, otherId) = await Account(unconfigured, "reset-member-c");
        var off = await otherAdmin.PostAsync($"/api/admin/users/{otherId}/password-reset-email", null);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, off.StatusCode);
        Assert.Contains(AdminEndpoints.EmailOffCode, await off.Content.ReadAsStringAsync());
    }

    private static Task<HttpResponseMessage> Forgot(HttpClient client, string email) =>
        client.PostAsJsonAsync("/api/auth/forgot-password", new ForgotPasswordRequest(email));

    private static Task<HttpResponseMessage> Reset(HttpClient client, string userId, string token, string password) =>
        client.PostAsJsonAsync("/api/auth/reset-password", new ResetPasswordRequest(userId, token, password));

    /// <summary>The account id and token of the newest email's link, waiting for the send that follows the answer.</summary>
    private static async Task<(string UserId, string Token, JsonDocument Body)> LinkAsync(RecordingHandler resend, int count)
    {
        for (var attempt = 0; resend.Bodies.Count < count && attempt < 100; attempt++)
        {
            await Task.Delay(50);
        }

        var body = JsonDocument.Parse(resend.Bodies[count - 1]);
        var match = LinkPattern().Match(body.RootElement.GetProperty("text").GetString()!);
        Assert.True(match.Success);
        return (Uri.UnescapeDataString(match.Groups[1].Value), Uri.UnescapeDataString(match.Groups[2].Value), body);
    }

    [GeneratedRegex(@"https://lorevolve\.example/reset-password#user=([^&\s]+)&token=(\S+)")]
    private static partial Regex LinkPattern();

    private static WebApplicationFactory<Program> Host(RecordingHandler resend, bool configured)
    {
        var settings = new Dictionary<string, string?> { ["PublicSite:Origin"] = Origin };
        if (configured)
        {
            settings["Email:ApiKey"] = "re_test_key";
            settings["Email:From"] = "LorEvolve <noreply@lorevolve.example>";
        }

        return new LorEvolveApiFactory { Settings = settings }.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddHttpClient(AppEmail.HttpClientName).ConfigurePrimaryHttpMessageHandler(() => resend)));
    }

    private static async Task<(HttpClient Client, string Id)> Admin(WebApplicationFactory<Program> api, string tag)
    {
        var (client, id) = await Account(api, tag);
        using var scope = api.Services.CreateScope();
        await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), id, CancellationToken.None);
        return (client, id);
    }

    private static async Task<(HttpClient Client, string Id)> Account(WebApplicationFactory<Program> api, string tag)
    {
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"user-{tag}", $"{tag}@example.test", PublishingTestClient.Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    /// <summary>Resend, as far as a test needs it: records each request body and answers with one status.</summary>
    private sealed class RecordingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        private readonly List<string> bodies = [];

        public IReadOnlyList<string> Bodies
        {
            get
            {
                lock (bodies)
                {
                    return [.. bodies];
                }
            }
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = await request.Content!.ReadAsStringAsync(cancellationToken);
            lock (bodies)
            {
                bodies.Add(body);
            }

            return new HttpResponseMessage(status) { Content = new StringContent("{\"id\":\"test\"}") };
        }
    }
}
