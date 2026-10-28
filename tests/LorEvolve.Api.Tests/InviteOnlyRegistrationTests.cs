using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LorEvolve.Api.Tests;

/// <summary>
/// <c>Registration:InviteOnly</c> (#34 alpha condition for M-1): with it on, an account is created only with a live universe
/// invitation or an Admin's sign-up link, and only for the address it names. Off, registration is as open as before.
/// </summary>
public sealed class InviteOnlyRegistrationTests : IDisposable
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _api = new()
    {
        Settings = new Dictionary<string, string?> { ["Registration:InviteOnly"] = "true" },
    };

    public void Dispose() => _api.Dispose();

    [Fact]
    public async Task Off_by_default_anyone_registers()
    {
        using var open = new LorEvolveApiFactory();
        var client = open.CreateClient();
        Assert.False((await client.GetFromJsonAsync<RegistrationResponse>("/api/auth/registration"))!.InviteOnly);
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("open-anyone", "open-anyone@example.test", Password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Invite_only_refuses_a_registration_without_a_live_token()
    {
        var client = _api.CreateClient();
        Assert.True((await client.GetFromJsonAsync<RegistrationResponse>("/api/auth/registration"))!.InviteOnly);

        foreach (var token in new string?[] { null, "", "not-a-token" })
        {
            var refused = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("nobody", "nobody@example.test", Password, token));
            Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
            Assert.Equal(AuthEndpoints.InviteOnlyCode, await PublishingTestClient.ProblemCode(refused));
        }

        // Existing accounts are untouched: signing in still works.
        await Member("existing");
        var login = await _api.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest("existing@example.test", Password));
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task A_universe_invitation_opens_one_account_for_its_address_only()
    {
        var invitation = await Invite("ana@example.test");
        var client = _api.CreateClient();

        var otherAddress = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("mallory", "mallory@example.test", Password, invitation.ClaimToken));
        Assert.Equal(HttpStatusCode.BadRequest, otherAddress.StatusCode);

        var registered = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("ana", "Ana@Example.test", Password, invitation.ClaimToken));
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);

        // The new account then accepts the invitation as any invitee does.
        var accepted = await client.PostAsync($"/api/invitations/claim/{Uri.EscapeDataString(invitation.ClaimToken)}/accept", null);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);

        // Spent: the same link opens nothing for anyone now.
        var again = await _api.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest("ana2", "ana@example.test", Password, invitation.ClaimToken));
        Assert.Equal(HttpStatusCode.Forbidden, again.StatusCode);
    }

    [Fact]
    public async Task An_expired_invitation_opens_nothing()
    {
        var invitation = await Invite("late@example.test");
        using (var scope = _api.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>();
            await db.UniverseInvitations.Where(row => row.Id == invitation.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1)));
        }

        var refused = await _api.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest("late", "late@example.test", Password, invitation.ClaimToken));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
    }

    [Fact]
    public async Task An_admin_sign_up_link_opens_its_address_and_only_an_admin_mints_one()
    {
        var (member, _) = await Member("plain");
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsJsonAsync("/api/admin/signup-links", new SignUpLinkRequest("x@example.test"))).StatusCode);

        var (admin, adminId) = await Member("boss");
        using (var scope = _api.Services.CreateScope())
        {
            await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), adminId, CancellationToken.None);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/admin/signup-links", new SignUpLinkRequest("not an email"))).StatusCode);
        var link = (await (await admin.PostAsJsonAsync("/api/admin/signup-links", new SignUpLinkRequest("bea@example.test"))).Content
            .ReadFromJsonAsync<SignUpLinkResponse>())!;
        Assert.InRange(link.ExpiresAt, DateTime.UtcNow.AddDays(6.9), DateTime.UtcNow.AddDays(7.1));

        var client = _api.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("eve", "eve@example.test", Password, link.Token))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest("bea", "bea@example.test", Password, link.Token))).StatusCode);

        // One account per address: the link now only meets "already registered".
        var second = await _api.CreateClient().PostAsJsonAsync("/api/auth/register", new RegisterRequest("bea2", "bea@example.test", Password, link.Token));
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    /// <summary>An account made directly, as one that existed before the switch was turned on, signed in.</summary>
    private async Task<(HttpClient Client, string UserId)> Member(string name)
    {
        using (var scope = _api.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<LorEvolveUser>>();
            var created = await users.CreateAsync(new LorEvolveUser { UserName = name, Email = $"{name}@example.test" }, Password);
            Assert.True(created.Succeeded);
        }

        var client = _api.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(name, Password));
        login.EnsureSuccessStatusCode();
        return (client, (await login.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private async Task<PendingInvitationResponse> Invite(string email)
    {
        var (owner, _) = await Member($"owner-{Guid.NewGuid():N}"[..20]);
        var universe = await PublishingTestClient.CreateUniverse(owner, "Invite-only world");
        var response = await owner.PostAsJsonAsync($"/api/universes/{universe.Id}/invitations", new InvitationRequest(email, UniverseRole.Editor));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<PendingInvitationResponse>())!;
    }
}
