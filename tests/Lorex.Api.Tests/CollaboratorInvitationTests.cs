using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using static Lorex.Api.Tests.CollaborationTestClient;
using static Lorex.Api.Tests.PlotTestClient;

namespace Lorex.Api.Tests;

/// <summary>
/// Invitations and collaborator management (ADR 0041 amendment, refinement 030). An owner invites an address - never an
/// account, and never learns whether one exists - and manages who works on the universe. Only the account whose
/// normalized email an invitation names can read, accept or decline it; accepting makes the membership with the role
/// the invitation holds at that moment and spends it.
/// </summary>
public sealed class CollaboratorInvitationTests(LorexApiFactory factory) : IClassFixture<LorexApiFactory>
{
    private const string Password = "Test-password-123!";

    private readonly LorexApiFactory _factory = factory;

    // ---------- Creating invitations ----------

    [Fact]
    public async Task The_owner_invites_as_editor_reviewer_or_viewer_and_sees_them_pending_apart_from_members()
    {
        var w = await NewSharedWorld(_factory, "inv-roles");

        var editor = await Invited(w.Owner, w.U, "inv-roles-e@example.test", UniverseRole.Editor);
        var reviewer = await Invited(w.Owner, w.U, "inv-roles-r@example.test", UniverseRole.Reviewer);
        var viewer = await Invited(w.Owner, w.U, "inv-roles-v@example.test", UniverseRole.Viewer);

        Assert.Equal(UniverseRole.Editor, editor.Role);
        Assert.Equal(UniverseRole.Reviewer, reviewer.Role);
        Assert.Equal(UniverseRole.Viewer, viewer.Role);
        Assert.Equal(TimeSpan.FromDays(30), editor.ExpiresAt - editor.CreatedAt);

        var listed = await Collaborators(w.Owner, w.U);
        Assert.Equal(
            ["inv-roles-e@example.test", "inv-roles-r@example.test", "inv-roles-v@example.test"],
            listed.Invitations.Select(invitation => invitation.Email).Order());
        Assert.Equal(
            [("user-inv-roles-editor", UniverseRole.Editor), ("user-inv-roles-reviewer", UniverseRole.Reviewer), ("user-inv-roles-viewer", UniverseRole.Viewer)],
            listed.Members.Select(member => (member.Username, member.Role)));
        Assert.Equal(w.EditorId, listed.Members[0].UserId);

        // The owner's list names people by username, and never shows an accepted collaborator's email.
        var raw = await w.Owner.GetStringAsync($"/api/universes/{w.U}/collaborators");
        Assert.DoesNotContain("inv-roles-editor@example.test", raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(w.OwnerId, raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Owner_and_unknown_roles_are_refused_and_nothing_is_written()
    {
        var w = await NewSharedWorld(_factory, "inv-badrole");

        foreach (var body in new object[]
        {
            new { email = "x@example.test", role = (int)UniverseRole.Owner },
            new { email = "x@example.test", role = 9 },
            new { email = "x@example.test" },
            new { email = "not an address", role = (int)UniverseRole.Viewer },
            new { email = "", role = (int)UniverseRole.Viewer },
        })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", body)).StatusCode);
        }

        var invitation = await Invited(w.Owner, w.U, "inv-badrole@example.test", UniverseRole.Viewer);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/invitations/{invitation.Id}", new { role = 0 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/collaborators/{w.EditorId}", new { role = 0 })).StatusCode);

        Assert.Single((await Collaborators(w.Owner, w.U)).Invitations);
        Assert.Equal(UniverseRole.Editor, (await Collaborators(w.Owner, w.U)).Members.Single(member => member.UserId == w.EditorId).Role);
    }

    [Fact]
    public async Task Collaborators_cannot_manage_collaborators_and_outsiders_cannot_find_the_universe()
    {
        var w = await NewSharedWorld(_factory, "inv-deny");
        var pending = await Invited(w.Owner, w.U, "inv-deny@example.test", UniverseRole.Viewer);
        var u = $"/api/universes/{w.U}";

        foreach (var who in new[] { w.Editor, w.Reviewer, w.Viewer })
        {
            await AssertDenied(await who.GetAsync($"{u}/collaborators"), "list");
            await AssertDenied(await who.PostAsJsonAsync($"{u}/invitations", new InvitationRequest("friend@example.test", UniverseRole.Editor)), "invite");
            await AssertDenied(await who.PutAsJsonAsync($"{u}/invitations/{pending.Id}", new CollaboratorRoleRequest(UniverseRole.Editor)), "invitation role");
            await AssertDenied(await who.DeleteAsync($"{u}/invitations/{pending.Id}"), "revoke");
            await AssertDenied(await who.PutAsJsonAsync($"{u}/collaborators/{w.ViewerId}", new CollaboratorRoleRequest(UniverseRole.Editor)), "role");
            await AssertDenied(await who.DeleteAsync($"{u}/collaborators/{w.ViewerId}"), "remove");
        }

        await AssertHidden(await w.Outsider.GetAsync($"{u}/collaborators"), "outsider list");
        await AssertHidden(await w.Outsider.PostAsJsonAsync($"{u}/invitations", new InvitationRequest("friend@example.test", UniverseRole.Editor)), "outsider invite");

        var after = await Collaborators(w.Owner, w.U);
        Assert.Equal(3, after.Members.Count);
        Assert.Equal(pending.Id, Assert.Single(after.Invitations).Id);
    }

    [Fact]
    public async Task Inviting_an_address_answers_the_same_whether_or_not_an_account_holds_it()
    {
        var w = await NewSharedWorld(_factory, "inv-enum");
        await Register(_factory, "inv-enum-known", "inv-enum-known@example.test");

        var known = await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", new InvitationRequest("inv-enum-known@example.test", UniverseRole.Editor));
        var unknown = await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", new InvitationRequest("inv-enum-nobody@example.test", UniverseRole.Editor));

        Assert.Equal(HttpStatusCode.Created, known.StatusCode);
        Assert.Equal(HttpStatusCode.Created, unknown.StatusCode);
        Assert.Equal(Shape(await known.Content.ReadAsStringAsync()), Shape(await unknown.Content.ReadAsStringAsync()));
        Assert.Equal(["claimToken", "createdAt", "email", "expiresAt", "id", "role"], Shape(await known.Content.ReadAsStringAsync()));
    }

    [Fact]
    public async Task Addresses_match_as_Identity_normalizes_them_and_one_address_has_one_invitation()
    {
        var w = await NewSharedWorld(_factory, "inv-norm");
        var first = await Invited(w.Owner, w.U, "Inv-Norm.Ana@Example.test", UniverseRole.Viewer);

        var again = await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", new InvitationRequest("  inv-norm.ana@EXAMPLE.TEST ", UniverseRole.Editor));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        var problem = JsonDocument.Parse(await again.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(CollaboratorEndpoints.InvitationPendingCode, problem.GetProperty("code").GetString());
        Assert.Equal(first.Id, problem.GetProperty("invitationId").GetGuid());

        var only = Assert.Single((await Collaborators(w.Owner, w.U)).Invitations);
        Assert.Equal(UniverseRole.Viewer, only.Role);
        Assert.Equal("Inv-Norm.Ana@Example.test", only.Email);

        // An account registered afterwards in lower case is not shown it - an unverified address proves nothing - but its
        // link, for an address typed in mixed case, opens for that account.
        var (ana, _) = await Register(_factory, "inv-norm-ana", "inv-norm.ana@example.test");
        Assert.Empty(await Mine(ana));
        Assert.Equal(first.Id, (await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(first.ClaimToken)))!.Id);
    }

    [Fact]
    public async Task The_owner_cannot_invite_their_own_address_or_an_existing_collaborator()
    {
        var w = await NewSharedWorld(_factory, "inv-self");

        var self = await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", new InvitationRequest("INV-SELF-OWNER@example.test", UniverseRole.Editor));
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);
        Assert.Contains("your own email", await self.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var member = await w.Owner.PostAsJsonAsync($"/api/universes/{w.U}/invitations", new InvitationRequest("inv-self-viewer@example.test", UniverseRole.Editor));
        Assert.Equal(HttpStatusCode.BadRequest, member.StatusCode);
        Assert.Contains("already collaborates on this universe", await member.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        Assert.Empty((await Collaborators(w.Owner, w.U)).Invitations);
        await WithDb(_factory, async db => Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == w.U && row.UserId == w.OwnerId)));
    }

    [Fact]
    public async Task A_role_changed_while_pending_is_the_role_accepting_gives()
    {
        var w = await NewSharedWorld(_factory, "inv-change");
        var (ana, anaId) = await Register(_factory, "inv-change-ana", "inv-change-ana@example.test");
        var invitation = await Invited(w.Owner, w.U, "inv-change-ana@example.test", UniverseRole.Viewer);

        var changed = await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/invitations/{invitation.Id}", new CollaboratorRoleRequest(UniverseRole.Editor));
        Assert.Equal(UniverseRole.Editor, (await changed.Content.ReadFromJsonAsync<PendingInvitationResponse>())!.Role);

        Assert.Equal(UniverseRole.Editor, Assert.Single(await Mine(ana)).Role);

        var accepted = await ana.PostAsync($"/api/invitations/{invitation.Id}/accept", null);
        Assert.Equal(new AcceptedInvitationResponse(w.U, UniverseRole.Editor), await accepted.Content.ReadFromJsonAsync<AcceptedInvitationResponse>());
        Assert.Equal(UniverseRole.Editor, (await Collaborators(w.Owner, w.U)).Members.Single(member => member.UserId == anaId).Role);
    }

    [Fact]
    public async Task A_revoked_invitation_is_simply_gone()
    {
        var w = await NewSharedWorld(_factory, "inv-revoke");
        var (ana, anaId) = await Register(_factory, "inv-revoke-ana", "inv-revoke-ana@example.test");
        var invitation = await Invited(w.Owner, w.U, "inv-revoke-ana@example.test", UniverseRole.Editor);

        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{invitation.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{invitation.Id}")).StatusCode);

        Assert.Empty((await Collaborators(w.Owner, w.U)).Invitations);
        Assert.Empty(await Mine(ana));
        await AssertCode(await ana.GetAsync(Claim(invitation.ClaimToken)), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await ana.PostAsync($"{Claim(invitation.ClaimToken)}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertCode(await ana.PostAsync($"/api/invitations/{invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await AssertNotMember(w.U, anaId);
    }

    [Fact]
    public async Task An_expired_invitation_cannot_be_used_and_never_blocks_a_fresh_one()
    {
        var w = await NewSharedWorld(_factory, "inv-expire");
        var (ana, anaId) = await Register(_factory, "inv-expire-ana", "inv-expire-ana@example.test");
        var stale = await Invited(w.Owner, w.U, "inv-expire-ana@example.test", UniverseRole.Editor);
        await Expire(stale.Id);

        Assert.Empty(await Mine(ana));
        Assert.Empty((await Collaborators(w.Owner, w.U)).Invitations);
        var read = await ana.GetAsync(Claim(stale.ClaimToken));
        await AssertCode(read, HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);
        Assert.DoesNotContain("Shared inv-expire", await read.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        await AssertCode(await ana.PostAsync($"/api/invitations/{stale.Id}/accept", null), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);
        await AssertCode(await ana.PostAsync($"{Claim(stale.ClaimToken)}/accept", null), HttpStatusCode.Gone, InvitationEndpoints.ExpiredCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.PutAsJsonAsync($"/api/universes/{w.U}/invitations/{stale.Id}", new CollaboratorRoleRequest(UniverseRole.Viewer))).StatusCode);
        await AssertNotMember(w.U, anaId);

        // A fresh invitation to the same address replaces the lapsed one.
        var fresh = await Invited(w.Owner, w.U, "inv-expire-ana@example.test", UniverseRole.Reviewer);
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.UniverseInvitations.AnyAsync(row => row.Id == stale.Id));
            Assert.Equal(1, await db.UniverseInvitations.CountAsync(row => row.UniverseId == w.U));
        });

        // And a lapsed one can be removed by hand.
        await Expire(fresh.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"/api/universes/{w.U}/invitations/{fresh.Id}")).StatusCode);
    }

    [Fact]
    public async Task Deleting_the_universe_takes_its_invitations()
    {
        var (owner, _) = await PublishingTestClient.Account(_factory, "inv-cascade");
        var universe = await CreateUniverse(owner, "Inv cascade");
        var (ana, _) = await Register(_factory, "inv-cascade-ana", "inv-cascade-ana@example.test");
        var invitation = await Invited(owner, universe.Id, "inv-cascade-ana@example.test", UniverseRole.Editor);
        Assert.Single(await Mine(ana));

        await Ok(owner.PostAsync($"/api/universes/{universe.Id}/archive", null));
        await Ok(owner.DeleteAsync($"/api/universes/{universe.Id}"));

        await WithDb(_factory, async db => Assert.False(await db.UniverseInvitations.AnyAsync(row => row.Id == invitation.Id)));
        Assert.Empty(await Mine(ana));
    }

    // ---------- Accepting and declining ----------

    [Fact]
    public async Task The_matching_account_sees_accepts_and_works_in_the_universe()
    {
        var w = await NewSharedWorld(_factory, "inv-accept");
        var (ana, anaId) = await Register(_factory, "inv-accept-ana", "inv-accept-ana@example.test");
        var invitation = await Invited(w.Owner, w.U, "inv-accept-ana@example.test", UniverseRole.Editor);
        var (stranger, _) = await Register(_factory, "inv-accept-other", "inv-accept-other@example.test");

        var offered = Assert.Single(await Mine(ana));
        Assert.Equal(new ReceivedInvitationResponse(invitation.Id, w.U, "Shared inv-accept", UniverseRole.Editor, invitation.ExpiresAt), offered);
        Assert.Equal(offered, await ana.GetFromJsonAsync<ReceivedInvitationResponse>(Claim(invitation.ClaimToken)));
        Assert.Empty(await Mine(stranger));
        Assert.Empty(await Mine(w.Editor));

        var accepted = await ana.PostAsync($"/api/invitations/{invitation.Id}/accept", null);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(new AcceptedInvitationResponse(w.U, UniverseRole.Editor), await accepted.Content.ReadFromJsonAsync<AcceptedInvitationResponse>());

        await WithDb(_factory, async db =>
        {
            Assert.Equal(UniverseRole.Editor, (await db.UniverseMemberships.SingleAsync(row => row.UniverseId == w.U && row.UserId == anaId)).Role);
            Assert.False(await db.UniverseInvitations.AnyAsync(row => row.Id == invitation.Id));
        });

        Assert.Empty(await Mine(ana));
        var listed = (await ana.GetFromJsonAsync<UniversePage>("/api/universes"))!;
        Assert.Equal(UniverseRole.Editor, Assert.Single(listed.Items, item => item.Id == w.U).AccessRole);
        await CreateEntity(ana, w.U, "Written by Ana");

        // A second accept finds nothing to spend, and makes no second membership.
        await AssertCode(await ana.PostAsync($"/api/invitations/{invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        await WithDb(_factory, async db => Assert.Equal(1, await db.UniverseMemberships.CountAsync(row => row.UniverseId == w.U && row.UserId == anaId)));
    }

    [Fact]
    public async Task Declining_spends_the_invitation_and_makes_nothing()
    {
        var w = await NewSharedWorld(_factory, "inv-decline");
        var (ana, anaId) = await Register(_factory, "inv-decline-ana", "inv-decline-ana@example.test");
        var invitation = await Invited(w.Owner, w.U, "inv-decline-ana@example.test", UniverseRole.Editor);

        Assert.Equal(HttpStatusCode.NoContent, (await ana.PostAsync($"/api/invitations/{invitation.Id}/decline", null)).StatusCode);

        await AssertNotMember(w.U, anaId);
        Assert.Empty(await Mine(ana));
        Assert.Empty((await Collaborators(w.Owner, w.U)).Invitations);
        Assert.DoesNotContain(((await ana.GetFromJsonAsync<UniversePage>("/api/universes"))!).Items, item => item.Id == w.U);
        await AssertCode(await ana.PostAsync($"/api/invitations/{invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
    }

    [Fact]
    public async Task Another_account_learns_only_that_the_invitation_is_someone_elses()
    {
        var w = await NewSharedWorld(_factory, "inv-wrong");
        var invitation = await Invited(w.Owner, w.U, "inv-wrong-ana@example.test", UniverseRole.Editor);
        var (other, otherId) = await Register(_factory, "inv-wrong-other", "inv-wrong-other@example.test");

        var link = Claim(invitation.ClaimToken);
        foreach (var response in new[]
        {
            await other.GetAsync(link),
            await other.PostAsync($"{link}/accept", null),
            await other.PostAsync($"{link}/decline", null),
            await w.Editor.PostAsync($"{link}/accept", null),
            await w.Owner.PostAsync($"{link}/accept", null),
        })
        {
            var body = await response.Content.ReadAsStringAsync();
            await AssertCode(response, HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);
            foreach (var secret in new[] { "Shared inv-wrong", "inv-wrong-ana", w.U.ToString(), "inv-wrong-owner", "role" })
            {
                Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
            }
        }

        // By id - without the link - it is not there for anyone, bound to no one as it is.
        foreach (var who in new[] { other, w.Editor, w.Owner })
        {
            await AssertCode(await who.PostAsync($"/api/invitations/{invitation.Id}/accept", null), HttpStatusCode.NotFound, InvitationEndpoints.NotFoundCode);
        }

        // Expired makes no difference to what another account is told.
        await Expire(invitation.Id);
        await AssertCode(await other.GetAsync(link), HttpStatusCode.Forbidden, InvitationEndpoints.OtherAccountCode);

        await AssertNotMember(w.U, otherId);
        await WithDb(_factory, async db => Assert.True(await db.UniverseInvitations.AnyAsync(row => row.Id == invitation.Id)));

        // Nobody signed out learns anything at all.
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(link)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"{link}/accept", null)).StatusCode);
    }

    [Fact]
    public async Task The_owner_never_becomes_a_member_of_their_own_universe()
    {
        var w = await NewSharedWorld(_factory, "inv-ownacc");

        // Only a row written straight to the database can address the owner: creating one through the API is refused.
        var id = Guid.NewGuid();
        await WithDb(_factory, async db =>
        {
            var now = DateTime.UtcNow;
            db.UniverseInvitations.Add(new UniverseInvitation
            {
                Id = id, UniverseId = w.U, Email = "inv-ownacc-owner@example.test", NormalizedEmail = "INV-OWNACC-OWNER@EXAMPLE.TEST",
                TargetUserId = w.OwnerId, Role = UniverseRole.Editor, CreatedAt = now, ExpiresAt = now.AddDays(30),
            });
            await db.SaveChangesAsync();
        });

        Assert.Empty(await Mine(w.Owner));
        await AssertCode(await w.Owner.PostAsync($"/api/invitations/{id}/accept", null), HttpStatusCode.Conflict, InvitationEndpoints.OwnUniverseCode);
        await AssertNotMember(w.U, w.OwnerId);
        Assert.Equal(UniverseRole.Owner, (await w.Owner.GetFromJsonAsync<UniverseDetail>($"/api/universes/{w.U}"))!.AccessRole);
    }

    // ---------- Managing collaborators ----------

    [Fact]
    public async Task A_changed_role_applies_on_the_next_request()
    {
        var w = await NewSharedWorld(_factory, "inv-rolechange");
        var u = $"/api/universes/{w.U}";

        var demoted = await w.Owner.PutAsJsonAsync($"{u}/collaborators/{w.EditorId}", new CollaboratorRoleRequest(UniverseRole.Viewer));
        Assert.Equal(UniverseRole.Viewer, (await demoted.Content.ReadFromJsonAsync<CollaboratorResponse>())!.Role);
        await AssertDenied(await w.Editor.PostAsJsonAsync($"{u}/stories", new Lorex.Api.Features.Stories.StoryRequest("Not now", null, Lorex.Api.Features.Stories.StoryStatus.Planning)), "demoted editor");
        Assert.Equal(UniverseRole.Viewer, (await w.Editor.GetFromJsonAsync<UniverseDetail>(u))!.AccessRole);

        await Ok(w.Owner.PutAsJsonAsync($"{u}/collaborators/{w.ViewerId}", new CollaboratorRoleRequest(UniverseRole.Editor)));
        await CreateStory(w.Viewer, w.U, "Promoted viewer's story");
    }

    [Fact]
    public async Task Removing_a_collaborator_ends_their_access_and_keeps_everything_they_did()
    {
        var w = await NewSharedWorld(_factory, "inv-remove");
        var written = await CreateEntity(w.Editor, w.U, "Editor's entry");
        await Ok(w.Editor.DeleteAsync($"/api/universes/{w.U}/entities/{w.Other}"));
        var idea = await IdeaTestClient.CreateIdea(w.Editor, "Editor's own idea");

        Assert.Equal(HttpStatusCode.NoContent, (await w.Owner.DeleteAsync($"/api/universes/{w.U}/collaborators/{w.EditorId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.DeleteAsync($"/api/universes/{w.U}/collaborators/{w.EditorId}")).StatusCode);

        await AssertHidden(await w.Editor.GetAsync($"/api/universes/{w.U}"), "removed editor");
        await AssertHidden(await w.Editor.GetAsync($"/api/universes/{w.U}/entities/{written}"), "removed editor's own entry");
        Assert.DoesNotContain(((await w.Editor.GetFromJsonAsync<UniversePage>("/api/universes"))!).Items, item => item.Id == w.U);

        Assert.Equal("Editor's entry", (await w.Owner.GetFromJsonAsync<EntityDetail>($"/api/universes/{w.U}/entities/{written}"))!.Name);
        Assert.Contains((await w.Owner.GetFromJsonAsync<TrashPage>($"/api/universes/{w.U}/trash?pageSize=50"))!.Items, item => item.Id == w.Other);
        Assert.Equal("Editor's own idea", (await IdeaTestClient.ReadIdea(w.Editor, idea.Id)).Title);
        Assert.Equal(HttpStatusCode.OK, (await w.Editor.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task The_owner_is_no_membership_and_another_universes_ids_reach_nothing()
    {
        var w = await NewSharedWorld(_factory, "inv-ids");
        var u = $"/api/universes/{w.U}";

        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.PutAsJsonAsync($"{u}/collaborators/{w.OwnerId}", new CollaboratorRoleRequest(UniverseRole.Viewer))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await w.Owner.DeleteAsync($"{u}/collaborators/{w.OwnerId}")).StatusCode);
        Assert.Equal(UniverseRole.Owner, (await w.Owner.GetFromJsonAsync<UniverseDetail>(u))!.AccessRole);

        // Another owner, their own universe, this one's member and invitation ids.
        var (stranger, _) = await PublishingTestClient.Account(_factory, "inv-ids-stranger");
        var theirs = (await CreateUniverse(stranger, "Inv ids theirs")).Id;
        var invitation = await Invited(w.Owner, w.U, "inv-ids-ana@example.test", UniverseRole.Editor);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync($"/api/universes/{theirs}/collaborators/{w.EditorId}", new CollaboratorRoleRequest(UniverseRole.Viewer))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/universes/{theirs}/collaborators/{w.EditorId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PutAsJsonAsync($"/api/universes/{theirs}/invitations/{invitation.Id}", new CollaboratorRoleRequest(UniverseRole.Viewer))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.DeleteAsync($"/api/universes/{theirs}/invitations/{invitation.Id}")).StatusCode);

        var after = await Collaborators(w.Owner, w.U);
        Assert.Equal(UniverseRole.Editor, after.Members.Single(member => member.UserId == w.EditorId).Role);
        Assert.Equal(UniverseRole.Editor, Assert.Single(after.Invitations).Role);
    }

    // ---------- Backups ----------

    [Fact]
    public async Task Invitations_and_memberships_never_leave_in_a_backup_or_come_back_in_a_restore()
    {
        var w = await NewSharedWorld(_factory, "inv-backup");
        await Invited(w.Owner, w.U, "inv-backup-pending@example.test", UniverseRole.Editor);

        var archive = await RawArchive(w.Owner, w.U);
        var document = DocumentText(archive);
        Assert.Equal(28, (await Backup(w.Owner, w.U)).FormatVersion);
        foreach (var word in new[] { "invitation", "inv-backup-pending", "membership", "collaborator" })
        {
            Assert.DoesNotContain(word, document, StringComparison.OrdinalIgnoreCase);
        }

        var restored = await RestoreTestClient.RestoreArchive(w.Owner, archive, "Inv backup restored");
        await WithDb(_factory, async db =>
        {
            Assert.False(await db.UniverseInvitations.AnyAsync(row => row.UniverseId == restored.Id));
            Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == restored.Id));
        });
        Assert.Empty((await Collaborators(w.Owner, restored.Id)).Invitations);
    }

    // ---------- Helpers ----------

    private static async Task<(HttpClient Client, string UserId)> Register(LorexApiFactory factory, string username, string email)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, email, Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<PendingInvitationResponse> Invited(HttpClient owner, Guid universeId, string email, UniverseRole role)
    {
        var response = await owner.PostAsJsonAsync($"/api/universes/{universeId}/invitations", new InvitationRequest(email, role));
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PendingInvitationResponse>())!;
    }

    private static async Task<CollaboratorsResponse> Collaborators(HttpClient owner, Guid universeId) =>
        (await owner.GetFromJsonAsync<CollaboratorsResponse>($"/api/universes/{universeId}/collaborators"))!;

    /// <summary>The claim routes of an invitation's protected link.</summary>
    internal static string Claim(string token) => $"/api/invitations/claim/{Uri.EscapeDataString(token)}";

    private static async Task<List<ReceivedInvitationResponse>> Mine(HttpClient client) =>
        (await client.GetFromJsonAsync<List<ReceivedInvitationResponse>>("/api/invitations"))!;

    private Task Expire(Guid invitationId) =>
        WithDb(_factory, db => db.UniverseInvitations
            .Where(row => row.Id == invitationId)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ExpiresAt, DateTime.UtcNow.AddMinutes(-1))));

    private Task AssertNotMember(Guid universeId, string userId) =>
        WithDb(_factory, async db => Assert.False(await db.UniverseMemberships.AnyAsync(row => row.UniverseId == universeId && row.UserId == userId)));

    private static async Task AssertCode(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        Assert.True(response.StatusCode == status, $"expected {(int)status}, got {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
        Assert.Equal(code, await PublishingTestClient.ProblemCode(response));
    }

    /// <summary>A JSON object's property names, sorted: what an answer says, apart from its values.</summary>
    private static List<string> Shape(string json) =>
        [.. JsonDocument.Parse(json).RootElement.EnumerateObject().Select(property => property.Name).Order(StringComparer.Ordinal)];
}
