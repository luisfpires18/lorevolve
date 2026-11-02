using LorEvolve.Api.Features.DatabaseBackups;
using LorEvolve.Api.Hosting;

// Operator commands (ADR 0064): `database-backup run | list | restore-drill`, with the app's own configuration, then exit.
if (args is [DatabaseBackupCli.Verb, ..])
{
    Environment.ExitCode = await DatabaseBackupCli.RunAsync(args);
    return;
}

await LorEvolveHost.Build(args).RunAsync();

/// <summary>Exposed so integration tests can boot the real host through WebApplicationFactory.</summary>
public partial class Program;
