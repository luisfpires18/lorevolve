using Amazon.Runtime;
using Amazon.S3;
using Lorex.Api.Data;
using Lorex.Api.Features.Admin;
using Lorex.Api.Features.Media;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Lorex.Api.Features.DatabaseBackups;

/// <summary>
/// Daily database backups to a private R2 bucket (issue #54, ADR 0064). The schedule runs inside the web process on purpose:
/// it is the one writer SQLite has (ADR 0018), so it is the one place a consistent snapshot can be taken without a second
/// process touching a database on an SMB share. R2 stores the objects; it is not the scheduler.
/// </summary>
public static class DatabaseBackupSetup
{
    public static IServiceCollection AddLorexDatabaseBackups(this IServiceCollection services, IConfiguration configuration)
    {
        services.TryAddSingleton(TimeProvider.System);
        services.Configure<DatabaseBackupOptions>(configuration.GetSection(DatabaseBackupOptions.Section));
        services.AddSingleton(provider => TargetFor(provider.GetRequiredService<IOptions<DatabaseBackupOptions>>().Value));
        services.AddSingleton<DatabaseBackupRunner>();
        services.AddHostedService<DatabaseBackupService>();
        return services;
    }

    /// <summary>The store the settings describe, or why there is none. A half-configured store fails loudly, never falls back.</summary>
    public static DatabaseBackupTarget TargetFor(DatabaseBackupOptions options)
    {
        if (!options.Enabled)
        {
            return new DatabaseBackupTarget(null, "Database backups are off (DatabaseBackup:Enabled).");
        }

        if (string.IsNullOrWhiteSpace(options.Environment)
            || options.Environment.Any(character => !char.IsAsciiLetterOrDigit(character) && character != '-'))
        {
            return new DatabaseBackupTarget(null, "DatabaseBackup:Environment must name this environment (letters, digits, hyphens).");
        }

        if (string.Equals(options.Store, "FileSystem", StringComparison.OrdinalIgnoreCase))
        {
            return string.IsNullOrWhiteSpace(options.FileSystemPath)
                ? new DatabaseBackupTarget(null, "DatabaseBackup:FileSystemPath is not set.")
                : new DatabaseBackupTarget(new FileSystemDatabaseBackupStore(options.FileSystemPath), null);
        }

        var r2 = options.R2;
        if (!string.Equals(options.Store, "R2", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(r2.Bucket)
            || string.IsNullOrWhiteSpace(r2.AccessKeyId)
            || string.IsNullOrWhiteSpace(r2.SecretAccessKey)
            || (string.IsNullOrWhiteSpace(r2.AccountId) && string.IsNullOrWhiteSpace(r2.ServiceUrl)))
        {
            return new DatabaseBackupTarget(null, "DatabaseBackup:R2 needs Bucket, AccessKeyId, SecretAccessKey and AccountId.");
        }

        var serviceUrl = string.IsNullOrWhiteSpace(r2.ServiceUrl) ? $"https://{r2.AccountId}.r2.cloudflarestorage.com" : r2.ServiceUrl;
        var client = new AmazonS3Client(new BasicAWSCredentials(r2.AccessKeyId, r2.SecretAccessKey), MediaSetup.R2ClientConfig(serviceUrl));
        return new DatabaseBackupTarget(new R2DatabaseBackupStore(client, r2.Bucket), null);
    }

    /// <summary>Admin only (ADR 0059): the status, and Run now. Nothing here returns an object's bytes, a URL or a key's secret.</summary>
    public static IEndpointRouteBuilder MapDatabaseBackupEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin/database-backups").WithTags("Admin").RequireAuthorization(AdminSetup.Policy);

        group.MapGet("/", async (DatabaseBackupRunner runner, CancellationToken cancellationToken) =>
        {
            await RefreshQuietlyAsync(runner, cancellationToken);
            return Results.Ok(runner.Status());
        }).WithName("GetDatabaseBackups");

        group.MapPost("/run", (DatabaseBackupRunner runner, IHostApplicationLifetime lifetime) =>
        {
            if (!runner.IsReady)
            {
                return Results.Problem(
                    title: "Database backups are not set up.",
                    detail: runner.Status().Problem ?? "Database backups are off.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = "database_backup_not_configured" });
            }

            // The run outlives this request: it is bound to the host, not to a browser tab.
            return runner.TryStart("admin", lifetime.ApplicationStopping) is null
                ? Results.Problem(
                    title: "A database backup is already running.",
                    detail: "Wait for it to finish; its result shows here.",
                    statusCode: StatusCodes.Status409Conflict,
                    extensions: new Dictionary<string, object?> { ["code"] = "database_backup_running" })
                : Results.Accepted("/api/admin/database-backups", runner.Status());
        }).WithName("RunDatabaseBackup");

        return endpoints;
    }

    private static async Task RefreshQuietlyAsync(DatabaseBackupRunner runner, CancellationToken cancellationToken)
    {
        try
        {
            await runner.RefreshAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The status still answers with what it last knew; the schedule logs a store it cannot read.
        }
    }
}

/// <summary>
/// The schedule: after the schema is ready and a minute's grace, every quarter of an hour - read the store, run a backup when
/// one is due, and warn while the newest verified one is stale. Off with <c>DatabaseBackup:Automatic</c> = false.
/// </summary>
public sealed partial class DatabaseBackupService(
    DatabaseBackupRunner runner,
    LorexDatabaseInitializer database,
    IOptions<DatabaseBackupOptions> options,
    DatabaseBackupTarget target,
    ILogger<DatabaseBackupService> logger) : BackgroundService
{
    private static readonly TimeSpan FirstCheck = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan CheckEvery = TimeSpan.FromMinutes(15);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        if (target.Problem is { } problem)
        {
            LogMisconfigured(logger, problem);
            return;
        }

        if (!options.Value.Automatic)
        {
            return;
        }

        await database.EnsureSchemaAsync(stoppingToken);
        await Task.Delay(FirstCheck, stoppingToken);

        using var timer = new PeriodicTimer(CheckEvery);
        do
        {
            try
            {
                await runner.RefreshAsync(stoppingToken);
                if (runner.IsDue() && runner.TryStart("schedule", stoppingToken) is { } run)
                {
                    await run;
                }
                else if (runner.Status() is { Stale: true } status)
                {
                    LogStale(logger, status.LastVerifiedAgeHours, status.LastAttempt?.Error);
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                LogCheckFailed(logger, exception, DatabaseBackupRunner.Explain(exception));
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Database backups are enabled but cannot run: {Problem}")]
    private static partial void LogMisconfigured(ILogger logger, string problem);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Database backup is STALE: the last verified backup is {AgeHours} hours old (none when empty). Last error: {Error}")]
    private static partial void LogStale(ILogger logger, double? ageHours, string? error);

    [LoggerMessage(Level = LogLevel.Error, Message = "Database backup check failed: {Reason}")]
    private static partial void LogCheckFailed(ILogger logger, Exception exception, string reason);
}
