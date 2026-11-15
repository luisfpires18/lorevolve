namespace LorEvolve.Api.Tests;

/// <summary>
/// The contract between the agent task template and what Claude is told to do with an issue (#137).
///
/// An issue written from <c>.github/ISSUE_TEMPLATE/task.md</c> is the only authorization a task has, so a heading
/// dropped from the template silently removes a thing every later issue would have stated: its dependency, what it
/// must not touch, or how to verify it. Nothing fails when that happens, which is why it is checked here. The
/// template is read from the repository rather than from a copy, so these tests are about the file GitHub serves.
/// </summary>
public sealed class AgentTaskTemplateTests
{
    /// <summary>The headings every agent task issue states, in the order the template lays them out.</summary>
    private static readonly string[] RequiredHeadings =
    [
        "## Goal",
        "## Context",
        "## Current behavior",
        "## Expected behavior",
        "## Scope",
        "## Acceptance criteria",
        "## Constraints",
        "## Hints (optional)",
        "## Verification",
        "## Open questions",
    ];

    /// <summary>The template is the agent-ready one, so a new issue carries the label the milestone runs select on.</summary>
    [Fact]
    public void The_template_is_the_agent_ready_one()
    {
        var template = TemplateText();

        Assert.Contains("name: Agent task", template, StringComparison.Ordinal);
        Assert.Contains("labels: agent-ready", template, StringComparison.Ordinal);
    }

    /// <summary>Every heading is present, so no issue written from this template leaves one of them unsaid.</summary>
    [Fact]
    public void The_template_states_every_required_heading()
    {
        var template = TemplateText();
        var missing = RequiredHeadings.Where(heading => !template.Contains(heading, StringComparison.Ordinal)).ToList();

        Assert.True(
            missing.Count == 0,
            $"{string.Join(", ", missing)} missing from .github/ISSUE_TEMPLATE/task.md. An issue written from it "
                + "would not state them, and nothing else asks for them.");
    }

    /// <summary>
    /// Acceptance criteria are checkable boxes and the task is one PR, because both are what the close-out reads.
    /// </summary>
    [Fact]
    public void Acceptance_criteria_are_boxes_and_the_task_is_one_pull_request()
    {
        var template = TemplateText();
        var acceptance = Section(template, "## Acceptance criteria");

        Assert.Contains("- [ ]", acceptance, StringComparison.Ordinal);
        Assert.Contains("Exactly one implementation PR", template, StringComparison.Ordinal);
    }

    /// <summary>
    /// The verification commands name something that exists. A template whose example points at a test project or a
    /// runner this repository does not have reads as a passing check while running nothing.
    /// </summary>
    [Fact]
    public void The_verification_example_names_commands_this_repository_can_run()
    {
        var verification = Section(TemplateText(), "## Verification");

        Assert.Contains("dotnet test tests/LorEvolve.Api.Tests", verification, StringComparison.Ordinal);
        Assert.Contains("--workers=2 --retries=0", verification, StringComparison.Ordinal);
        Assert.True(
            Directory.Exists(Path.Combine(RepositoryRoot(), "tests", "LorEvolve.Api.Tests")),
            "The template's example runs tests/LorEvolve.Api.Tests, which is not in this repository.");
        Assert.True(
            Directory.Exists(Path.Combine(RepositoryRoot(), "tests", "LorEvolve.E2E")),
            "The template's example runs Playwright specs, but tests/LorEvolve.E2E is not in this repository.");
    }

    /// <summary>
    /// `CLAUDE.md` tells Claude to read the acceptance criteria first, and still forbids what it forbade before. The
    /// second half is the point: this issue added a line to a file whose other lines are the production guard rails.
    /// </summary>
    [Fact]
    public void Claude_md_puts_acceptance_first_and_keeps_its_restrictions()
    {
        var claude = File.ReadAllText(Path.Combine(RepositoryRoot(), "CLAUDE.md"));

        Assert.Contains(
            "read the acceptance criteria and verification commands first",
            claude,
            StringComparison.Ordinal);
        Assert.Contains("merge `dev` into `master` or deploy PROD", claude, StringComparison.Ordinal);
        Assert.Contains("merge into `demo`", claude, StringComparison.Ordinal);
        Assert.Contains("force-push", claude, StringComparison.Ordinal);
    }

    /// <summary>The text of one `##` section, up to the next one.</summary>
    private static string Section(string template, string heading)
    {
        var start = template.IndexOf(heading, StringComparison.Ordinal);
        Assert.True(start >= 0, $"{heading} missing from .github/ISSUE_TEMPLATE/task.md.");

        var next = template.IndexOf("\n## ", start + heading.Length, StringComparison.Ordinal);
        return next < 0 ? template[start..] : template[start..next];
    }

    private static string TemplateText() =>
        File.ReadAllText(Path.Combine(RepositoryRoot(), ".github", "ISSUE_TEMPLATE", "task.md"));

    /// <summary>The repository, found by walking up from the test binary to the folder holding the solution.</summary>
    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "src", "LorEvolve.Web")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory!.FullName;
    }
}
