using System.Net;
using System.Net.Http.Json;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using static LorEvolve.Api.Tests.PlotTestClient;
using static LorEvolve.Api.Tests.RestoreTestClient;
namespace LorEvolve.Api.Tests;
/// <summary>Production formats of Film and Series projects (#288): stored, validated against the kind, kept by a save and a backup.</summary>
public sealed class ProjectFormatTests(LorEvolveApiFactory factory) : IClassFixture<LorEvolveApiFactory>
{
    private readonly LorEvolveApiFactory _factory = factory;
    [Theory]
    [InlineData("feature-film", ProjectKind.Film)]
    [InlineData("short-film", ProjectKind.Film)]
    [InlineData("special", ProjectKind.Film)]
    [InlineData("trailer", ProjectKind.Film)]
    [InlineData("tv-show", ProjectKind.Series)]
    [InlineData("limited-series", ProjectKind.Series)]
    [InlineData("western-comic", ProjectKind.Comic)]
    [InlineData("manga", ProjectKind.Comic)]
    [InlineData("graphic-novel", ProjectKind.Comic)]
    [InlineData("one-shot", ProjectKind.Comic)]
    [InlineData("webcomic", ProjectKind.Comic)]
    public async Task Each_cinema_format_is_accepted_and_read_back(string format, ProjectKind kind)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"fmt{format}".Replace("-", string.Empty, StringComparison.Ordinal));
        var response = await Post(client, new ProjectRequest("Format test", kind, ProjectLifecycle.Planning, null, null, universe.Id, null, format));
        response.EnsureSuccessStatusCode();
        var created = (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
        Assert.Equal(format, created.Format);
        Assert.Equal(format, (await client.GetFromJsonAsync<ProjectDetail>($"/api/projects/{created.Id}"))!.Format);
    }
    [Theory]
    [InlineData("tv-show", ProjectKind.Film)]
    [InlineData("feature-film", ProjectKind.Series)]
    [InlineData("feature-film", ProjectKind.Comic)]
    [InlineData("tv-show", ProjectKind.Comic)]
    [InlineData("manga", ProjectKind.Film)]
    [InlineData("manga", ProjectKind.Series)]
    [InlineData("nonsense", ProjectKind.Film)]
    public async Task A_format_that_does_not_fit_the_kind_is_refused(string format, ProjectKind kind)
    {
        var (client, universe) = await SignedInWithUniverse(_factory, $"fmtbad{kind}{format}".Replace("-", string.Empty, StringComparison.Ordinal));
        var response = await Post(client, new ProjectRequest("Bad format", kind, ProjectLifecycle.Planning, null, null, universe.Id, null, format));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"format\"", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }
    [Fact]
    public async Task A_project_without_a_format_stays_valid_and_same_name_projects_keep_their_ids()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "fmtlegacy");
        var film = await Create(client, new ProjectRequest("Hollow Season", ProjectKind.Film, ProjectLifecycle.Planning, null, null, universe.Id, null));
        var series = await Create(client, new ProjectRequest("Hollow Season", ProjectKind.Series, ProjectLifecycle.Planning, null, null, universe.Id, null, "tv-show"));
        Assert.Null(film.Format);
        Assert.NotEqual(film.Id, series.Id);
        var saved = await Save(client, film, film with { Summary = "Edited" });
        Assert.Null(saved.Format);
    }
    [Fact]
    public async Task A_save_keeps_the_format_it_is_sent_and_clears_it_when_left_out()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "fmtsave");
        var project = await Create(client, new ProjectRequest("Kept", ProjectKind.Film, ProjectLifecycle.Planning, null, null, universe.Id, null, "trailer"));
        var renamed = await Save(client, project, project with { Name = "Kept, renamed" });
        Assert.Equal("trailer", renamed.Format);
        var changed = await Save(client, renamed, renamed with { Format = "short-film" });
        Assert.Equal("short-film", changed.Format);
        // The frontend's ProjectInput requires `format`, so no caller leaves it out; the API still stores what it is sent.
        var cleared = await client.PutAsJsonAsync(
            $"/api/projects/{changed.Id}",
            new ProjectRequest(changed.Name, changed.Kind, changed.Lifecycle, null, changed.Summary, universe.Id, changed.Version));
        cleared.EnsureSuccessStatusCode();
        Assert.Null((await cleared.Content.ReadFromJsonAsync<ProjectDetail>())!.Format);
    }
    [Fact]
    public async Task A_comic_without_a_format_stays_null_and_a_format_change_keeps_identity()
    {
        var (client, universe) = await SignedInWithUniverse(_factory, "fmtcomic");
        var comic = await Create(client, new ProjectRequest("Old comic", ProjectKind.Comic, ProjectLifecycle.Planning, null, null, universe.Id, null));
        Assert.Null(comic.Format);
        var same = await Save(client, comic, comic with { Summary = "Edited" });
        Assert.Null(same.Format);
        var changed = await Save(client, same, same with { Format = "manga" });
        Assert.Equal("manga", changed.Format);
        Assert.Equal(comic.Id, changed.Id);
        Assert.Equal(universe.Id, changed.Universe!.Id);
        Assert.Equal(comic.IsOwned, changed.IsOwned);
    }

    [Theory]
    [InlineData("manga", "Manga")]
    [InlineData("webcomic", "Webtoon")]
    [InlineData("western-comic", "Comic")]
    [InlineData("graphic-novel", "Comic")]
    [InlineData("one-shot", "Comic")]
    public void A_comic_format_picks_its_starter_template_and_beats_the_subtype(string format, string template)
    {
        Assert.Equal(template, ProjectTemplates.For(ProjectKind.Comic, "webtoon", format).Name);
        Assert.Equal("Webtoon", ProjectTemplates.For(ProjectKind.Comic, "webtoon", null).Name);
    }

    [Fact]
    public async Task The_format_survives_a_backup_and_restore()
    {
        var client = await SignedIn(_factory, "fmtbackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Formats world")).Id;
        var film = await Create(client, new ProjectRequest("Short one", ProjectKind.Film, ProjectLifecycle.Planning, null, null, u, null, "short-film"));
        var series = await Create(client, new ProjectRequest("Long one", ProjectKind.Series, ProjectLifecycle.Planning, null, null, u, null));
        var archive = await RawArchive(client, u);
        var backup = BackupOf(archive);
        Assert.Equal("short-film", backup.Payload.CreativeProjects!.Single(project => project.Id == film.Id).Format);
        Assert.Null(backup.Payload.CreativeProjects!.Single(project => project.Id == series.Id).Format);
        var restored = await RestoreArchive(client, archive, "Formats world restored");
        var projects = (await client.GetFromJsonAsync<List<ProjectDetail>>($"/api/projects?universeId={restored.Id}"))!;
        Assert.Equal("short-film", projects.Single(project => project.Name == "Short one").Format);
        Assert.Null(projects.Single(project => project.Name == "Long one").Format);
    }
    [Fact]
    public async Task A_backup_whose_comic_carries_a_film_format_is_refused()
    {
        var client = await SignedIn(_factory, "fmtcomicbackup");
        var u = (await PublishingTestClient.CreateUniverse(client, "Comic formats world")).Id;
        await Create(client, new ProjectRequest("Manga one", ProjectKind.Comic, ProjectLifecycle.Planning, null, null, u, null, "manga"));
        var archive = await RawArchive(client, u);
        Assert.Equal("manga", BackupOf(archive).Payload.CreativeProjects!.Single().Format);

        var bad = Rewrite(archive, root => root["payload"]!["creativeProjects"]![0]!["format"] = "tv-show");
        await Refused(await Validate(client, bad));
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, ProjectRequest request) =>
        client.PostAsJsonAsync("/api/projects", request);
    private static async Task<ProjectDetail> Create(HttpClient client, ProjectRequest request)
    {
        var response = await Post(client, request);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }
    private static async Task<ProjectDetail> Save(HttpClient client, ProjectDetail current, ProjectDetail edited)
    {
        var response = await client.PutAsJsonAsync(
            $"/api/projects/{current.Id}",
            new ProjectRequest(edited.Name, edited.Kind, edited.Lifecycle, edited.Subtype, edited.Summary, current.Universe!.Id, current.Version, edited.Format));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ProjectDetail>())!;
    }
}
