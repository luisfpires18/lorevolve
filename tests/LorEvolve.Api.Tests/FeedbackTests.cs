using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Feedback;
using Microsoft.Extensions.DependencyInjection;
using static LorEvolve.Api.Tests.McpTestClient;

namespace LorEvolve.Api.Tests;

/// <summary>
/// Bug reports and feature requests: any signed-in account sends one, it is checked, only the path of the page is kept, and
/// only an Admin reads the list - by username, newest first.
/// </summary>
public sealed class FeedbackTests : IDisposable
{
    private readonly LorEvolveApiFactory _api = new();

    public void Dispose() => _api.Dispose();

    [Fact]
    public async Task A_member_sends_a_report_and_only_an_admin_reads_it()
    {
        var (member, _) = await NewBrowser(_api, "fb-member");
        var (admin, adminId) = await NewBrowser(_api, "fb-admin");
        using (var scope = _api.Services.CreateScope())
        {
            await PlatformAdminProvisioning.ProvisionAsync(scope.ServiceProvider.GetRequiredService<LorEvolveDbContext>(), adminId, CancellationToken.None);
        }

        // Checked: a kind, and some words.
        Assert.Equal(HttpStatusCode.BadRequest, (await member.PostAsJsonAsync("/api/feedback", new FeedbackRequest(null, "x", null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await member.PostAsJsonAsync("/api/feedback", new FeedbackRequest(FeedbackKind.Bug, "  ", null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await member.PostAsJsonAsync("/api/feedback", new FeedbackRequest(FeedbackKind.Bug, new string('a', FeedbackReport.TextMaxLength + 1), null))).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await member.PostAsJsonAsync("/api/feedback", new FeedbackRequest(FeedbackKind.Bug, "The save button does nothing.", "/app/universes/x/lore?q=secret#top"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.PostAsJsonAsync("/api/feedback", new FeedbackRequest(FeedbackKind.Feature, "Dark map pins.", "https://elsewhere.test/x"))).StatusCode);

        // A member cannot read the list; an Admin can, newest first, by username, with only the path kept.
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/admin/feedback")).StatusCode);
        var page = (await admin.GetFromJsonAsync<FeedbackReportPage>("/api/admin/feedback"))!;
        Assert.Equal(2, page.TotalCount);
        Assert.Equal([FeedbackKind.Feature, FeedbackKind.Bug], page.Items.Select(item => item.Kind));
        Assert.Null(page.Items[0].Page);
        Assert.Equal("/app/universes/x/lore", page.Items[1].Page);
        Assert.Equal("user-fb-member", page.Items[1].UserName);
    }

    [Fact]
    public async Task A_signed_out_visitor_cannot_send_one()
    {
        var anonymous = _api.CreateClient();
        var response = await anonymous.PostAsJsonAsync("/api/feedback", new FeedbackRequest(FeedbackKind.Bug, "Hello", null));
        Assert.Contains(response.StatusCode, new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.BadRequest });
    }
}
