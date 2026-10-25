using System.Net;
using System.Net.Http.Json;
using Lorex.Api.Data;
using Lorex.Api.Features.Admin;
using Lorex.Api.Features.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Lorex.Api.Tests;

/// <summary>
/// The Admin role over a real SQLite file (#40), where each request has its own connection: the owner's existing account
/// becomes Admin from <c>PlatformAdmin:OwnerUserId</c> when the server starts, again and again without harm, and two
/// blocks of one account at the same moment apply once. Credentials are obviously synthetic.
/// </summary>
public sealed class AdminProvisioningFileTests : IDisposable
{
    private const string Password = "Test-password-123!";

    private readonly string _directory = Path.Combine(Path.GetTempPath(), "lorex-admin", Guid.NewGuid().ToString("n"));

    private string DataSource => Path.Combine(_directory, "lorex.db");

    [Fact]
    public async Task The_configured_id_becomes_admin_at_startup_and_a_restart_changes_nothing_more()
    {
        Directory.CreateDirectory(_directory);
        string ownerId;
        await using (var before = new FileHost(DataSource, ownerUserId: null))
        {
            ownerId = (await Register(before, "user-unreally")).Id;
            await Register(before, "user-bystander");
        }

        for (var start = 0; start < 2; start++)
        {
            await using var host = new FileHost(DataSource, ownerId);
            var owner = await SignIn(host, "user-unreally");
            Assert.True((await owner.GetFromJsonAsync<AuthUserResponse>("/api/auth/me"))!.IsAdmin);
            Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/admin/overview")).StatusCode);

            var bystander = await SignIn(host, "user-bystander");
            Assert.Equal(HttpStatusCode.Forbidden, (await bystander.GetAsync("/api/admin/overview")).StatusCode);

            using var scope = host.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
            Assert.Equal([ownerId], await db.Users.Where(user => user.PlatformRole == PlatformRole.Admin).Select(user => user.Id).ToListAsync());
        }

        // A setting that names no account grants nothing, and the host still starts.
        await using var unknown = new FileHost(DataSource, "user-bystander");
        var stillMember = await SignIn(unknown, "user-bystander");
        Assert.Equal(HttpStatusCode.Forbidden, (await stillMember.GetAsync("/api/admin/overview")).StatusCode);
    }

    [Fact]
    public async Task Two_blocks_at_the_same_moment_apply_once_and_are_audited_once()
    {
        Directory.CreateDirectory(_directory);
        string ownerId;
        await using (var before = new FileHost(DataSource, ownerUserId: null))
        {
            ownerId = (await Register(before, "user-owner")).Id;
        }

        await using var host = new FileHost(DataSource, ownerId);
        var (_, memberId) = await Register(host, "user-raced");
        var first = await SignIn(host, "user-owner");
        var second = await SignIn(host, "user-owner");

        var answers = await Task.WhenAll(
            first.PostAsJsonAsync($"/api/admin/users/{memberId}/block", new AdminActionRequest("First report.")),
            second.PostAsJsonAsync($"/api/admin/users/{memberId}/block", new AdminActionRequest("Second report.")));

        Assert.Single(answers, answer => answer.StatusCode == HttpStatusCode.OK);
        Assert.Single(answers, answer => answer.StatusCode == HttpStatusCode.Conflict);

        using var scope = host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LorexDbContext>();
        Assert.Equal(1, await db.AdminAuditRecords.CountAsync(record => record.TargetUserId == memberId));
    }

    private static async Task<(HttpClient Client, string Id)> Register(FileHost host, string username)
    {
        var client = host.CreateHttpsClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(username, $"{username}@example.test", Password));
        response.EnsureSuccessStatusCode();
        return (client, (await response.Content.ReadFromJsonAsync<AuthUserResponse>())!.Id);
    }

    private static async Task<HttpClient> SignIn(FileHost host, string username)
    {
        var client = host.CreateHttpsClient();
        (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(username, Password))).EnsureSuccessStatusCode();
        return client;
    }

    private sealed class FileHost(string dataSource, string? ownerUserId) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting($"ConnectionStrings:{DatabaseSetup.ConnectionStringName}", $"Data Source={dataSource}");
            builder.UseSetting("Media:Provider", "InMemory");
            builder.UseSetting(PlatformAdminProvisioning.OwnerUserIdKey, ownerUserId ?? string.Empty);
        }

        public HttpClient CreateHttpsClient() => CreateClient(
            new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();

        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch (IOException)
        {
            // A handle Windows has not let go of yet; the directory is under the temp root and named for this run.
        }
    }
}
