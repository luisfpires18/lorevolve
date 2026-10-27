using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static LorEvolve.Api.Tests.CollaborationTestClient;
using static LorEvolve.Api.Tests.CollaboratorInvitationTests;
using static LorEvolve.Api.Tests.PlotTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Who may claim an invitation, now that an email address is known not to be an identity (ADR 0041 amendment). LorEvolve does
/// not verify the address an account registers with, so holding the invited address proves nothing - not even when the
/// account held it before the owner invited it, since anyone can register any address first (issue #33, H-1). An
/// invitation is claimed only with the protected link the owner sent, the email then a consistency check. The owner is
/// never told whether an account held the address.
/// </summary>
public sealed class InvitationClaimTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorEvolveApiFactory _factory = factory;

    [Fact]
    public async Task An_account_that_registered_the_address_first_gets_nothing_without_the_link()
    {
        var w = await NewSharedWorld(_factory, "claim-first");

        // Someone registers the address before the owner ever invites it - the real person, or anyone who guessed it.
        var (squatter, squatterId) = await Register("claim-first-ana");

        var created = await Invite(w.Owner, w.U, "claim-first-ana@example.test");
        var nobody = await Invite(w.Owner, w.U, "claim-first-nobody@example.test");

        // The owner's answers cannot tell the two apart - same status, same fields, no account id anywhere.
        Assert.Equal(created.Status, nobody.Status);
        Assert.Equal(Fields(created.Body), Fields(nobody.Body));
        Assert.DoesNotContain(squatterId, created.Body, StringComparison.Ordinal);
        Assert.DoesNotContain("target", created.Body, StringComparison.OrdinalIgnoreCase);
        var listed = await w.Owner.GetStringAsync($"/api/universes/{w.U}/collaborators");
        Assert.DoesNotContain(squatterId, listed, StringComparison.Ordinal);
        Assert.DoesNotContain("target", listed, StringComparison.OrdinalIgnoreCase);

        // No list shows it to the account, and no id opens it: those routes are gone.
        Assert.Equal(HttpStatusCode.NotFound, (await squatter.GetAsync("/api/invitations")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await squatter.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await squatter.PostAsync($"/api/invitations/{created.Invitation.Id}/decline", null)).StatusCode);
        await AssertNotMember(w.U, squatterId);
        await WithDb(_factory, async db => Assert.True(await db.UniverseInvitations.AnyAsync(row => row.Id == created.Invitation.Id)));

        // Only the link the owner sends opens it.
        await Ok(squatter.PostAsync($"{Claim(created.Invitation.ClaimToken)}/accept", null));
        await AssertMember(w.U, squatterId, UniverseRole.Editor);
    }

    [Fact]
    public async Task An_account_made_later_with_the_invited_address_is_not_given_the_invitation()
    {
        var w = await NewSharedWorld(_factory, "claim-later");
        var created = await Invite(w.Owner, w.U, "claim-later-ana@example.test");

        // Someone registers the address afterwards. Nothing surfaces, and nothing opens by id.
        var (impostor, impostorId) = await Register("claim-later-ana");
        Assert.Equal(HttpStatusCode.NotFound, (await impostor.GetAsync("/api/invitations")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await impostor.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await impostor.PostAsync($"/api/invitations/{created.Invitation.Id}/decline", null)).StatusCode);
        await AssertNotMember(w.U, impostorId);

        await WithDb(_factory, async db => Assert.True(await db.UniverseInvitations.AnyAsync(candidate => candidate.Id == created.Invitation.Id)));
    }

    [Fact]
    public async Task An_account_an_older_invitation_was_bound_to_gains_nothing_by_it()
    {
        var w = await NewSharedWorld(_factory, "claim-legacy");
        var created = await Invite(w.Owner, w.U, "claim-legacy-ana@example.test", UniverseRole.Viewer);
        var (ana, anaId) = await Register("claim-legacy-ana");
        var (bound, boundId) = await Register("claim-legacy-bound");

        var link = Claim(created.Invitation.ClaimToken);
        await AssertCode(await bound.GetAsync(link), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        await AssertCode(await bound.PostAsync($"{link}/accept", null), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bound.PostAsync($"/api/invitations/{created.Invitation.Id}/accept", null)).StatusCode);
        await AssertNotMember(w.U, boundId);

        // The link's own address still claims it.
        await Ok(ana.PostAsync($"{link}/accept", null));
        await AssertMember(w.U, anaId, UniverseRole.Viewer);
    }

    [Fact]
    public async Task The_link_opens_an_unbound_invitation_for_the_matching_account_and_nobody_else()
    {
        var w = await NewSharedWorld(_factory, "claim-link");
        var created = await Invite(w.Owner, w.U, "claim-link-ana@example.test", UniverseRole.Reviewer);
        var (ana, anaId) = await Register("claim-link-ana");
        var (other, otherId) = await Register("claim-link-other");
        var link = Claim(created.Invitation.ClaimToken);

        // 9: the link in another account's hands is someone else's, and says nothing more.
        var wrong = await other.GetAsync(link);
        await AssertCode(wrong, HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        var body = await wrong.Content.ReadAsStringAsync();
        foreach (var secret in new[] { "Shared claim-link", "claim-link-ana", w.U.ToString(), "Reviewer" })
        {
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
        }

        await AssertCode(await other.PostAsync($"{link}/accept", null), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
        await AssertNotMember(w.U, otherId);

        // 7: the matching account reads it.
        var read = (await ana.GetFromJsonAsync<ReceivedInvitationResponse>(link))!;
        Assert.Equal(new ReceivedInvitationResponse(created.Invitation.Id, w.U, "Shared claim-link", UniverseRole.Reviewer, created.Invitation.ExpiresAt), read);

        // A second link minted for the same invitation is just as good.
        var again = (await w.Owner.GetFromJsonAsync<CollaboratorsResponse>($"/api/universes/{w.U}/collaborators"))!.Invitations.Single();
        Assert.NotEqual(created.Invitation.ClaimToken, again.ClaimToken);
        Assert.Equal(read, await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(again.ClaimToken)));

        // 8: and accepts it.
        var accepted = await ana.PostAsync($"{link}/accept", null);
        Assert.Equal(new AcceptedInvitationResponse(w.U, UniverseRole.Reviewer), await accepted.Content.ReadFromJsonAsync<AcceptedInvitationResponse>());
        await AssertMember(w.U, anaId, UniverseRole.Reviewer);

        // 14: spent - every link to it, old or new, opens nothing now.
        await AssertCode(await ana.PostAsync($"{link}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await ana.GetAsync(Claim(again.ClaimToken)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await WithDb(_factory, async db => Assert.Equal(1, await db.UniverseMemberships.CountAsync(row => row.UniverseId == w.U && row.UserId == anaId)));
    }

    [Fact]
    public async Task No_token_a_forged_token_or_an_edited_one_opens_nothing()
    {
        var w = await NewSharedWorld(_factory, "claim-forge");
        var created = await Invite(w.Owner, w.U, "claim-forge-ana@example.test");
        var (ana, anaId) = await Register("claim-forge-ana");
        var token = created.Invitation.ClaimToken;

        // 10, 11: nothing, garbage, an id instead of a token, a token edited by one character, or truncated.
        var edited = token[..^3] + (token[^3] == 'A' ? 'B' : 'A') + token[^2..];
        foreach (var bad in new[] { "not-a-token", created.Invitation.Id.ToString(), Convert.ToBase64String(Guid.NewGuid().ToByteArray()), edited, token[..(token.Length / 2)] })
        {
            await AssertCode(await ana.GetAsync(Claim(bad)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
            await AssertCode(await ana.PostAsync($"{Claim(bad)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        }

        await AssertNotMember(w.U, anaId);

        // A token issued for one invitation never opens another one, not even one to the same address after a revoke.
        await Ok(w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{created.Invitation.Id}"));
        var fresh = await Invite(w.Owner, w.U, "claim-forge-ana@example.test");
        await AssertCode(await ana.GetAsync(Claim(token)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        Assert.Equal(fresh.Invitation.Id, (await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(fresh.Invitation.ClaimToken)))!.Id);
    }

    [Fact]
    public async Task A_link_issued_before_expiry_revoke_or_decline_opens_nothing_after()
    {
        var w = await NewSharedWorld(_factory, "claim-after");
        var (ana, anaId) = await Register("claim-after-ana");

        // 12: expired.
        var expiring = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        await WithDb(_factory, db => db.UniverseInvitations.Where(row => row.Id == expiring.Invitation.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));
        await AssertCode(await ana.GetAsync(Claim(expiring.Invitation.ClaimToken)), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);
        await AssertCode(await ana.PostAsync($"{Claim(expiring.Invitation.ClaimToken)}/accept", null), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);

        // 13: revoked (the fresh invitation replaces the lapsed one).
        var revoked = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        await Ok(w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{revoked.Invitation.Id}"));
        await AssertCode(await ana.PostAsync($"{Claim(revoked.Invitation.ClaimToken)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);

        // 14: declined.
        var declined = await Invite(w.Owner, w.U, "claim-after-ana@example.test");
        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync($"{Claim(declined.Invitation.ClaimToken)}/decline", null)).StatusCode);
        await AssertCode(await ana.PostAsync($"{Claim(declined.Invitation.ClaimToken)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);

        await AssertNotMember(w.U, anaId);
    }

    // ---------- Helpers ----------

    private sealed record Created(HttpStatusCode Status, string Body, PendingInvitationResponse Invitation);

    private async Task<(HttpClient Client, string UserId)> Register(string name)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest($"user-{name}", $"{name}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<Created> Invite(HttpClient owner, Guid universeId, string email, UniverseRole role = UniverseRole.Editor)
    {
        var response = await owner.PostAsJsonAsync($"/api/universes/{universeId}/invitations", new InvitationRequest(email, role));
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.Created, body);
        return new Created(response.StatusCode, body, JsonSerializer.Deserialize<PendingInvitationResponse>(body, JsonSerializerOptions.Web)!);
    }

    private static List<string> Fields(string json) =>
        [.. JsonDocument.Parse(json).RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];

    private Task AssertMember(Guid universeId, string userId, UniverseRole role) =>
        WithDb(_factory, async db => Assert.Equal(role, (await db.UniverseMemberships.SingleAsync(row => row.UniverseId == universeId && row.UserId == userId)).Role));

    private Task AssertNotMember(Guid universeId, string userId) =>
        WithDb(_factory, async db => Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == universeId && row.UserId == userId)));

    private static async Task AssertCode(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.True(response.StatusCode == status, $"expected {(int)status}, got {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        Assert.Equal(code, await PublishingTestClient.ProblemCode(response));
    }
}
