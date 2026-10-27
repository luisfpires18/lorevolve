using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Data;

/// <summary>Wires the SQLite-backed <see cref="LorEvolveDbContext"/> into the host.</summary>
public static class DatabaseSetup
{
    public const string ConnectionStringName = "LorEvolveDb";

    /// <summary>
    /// Registers the context and the startup step that migrates it. Both belong together: an app
    /// that can reach the database is an app that has to be sure of its schema first.
    /// </summary>
    public static IServiceCollection AddLorEvolveDatabase(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString(ConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{ConnectionStringName}' is not configured.");

        connectionString = ResolveDataSourceDirectory(connectionString, environment.ContentRootPath);

        services.AddDbContext<LorEvolveDbContext>(options => options.UseSqlite(connectionString));

        // One instance, reachable two ways: as the first hosted service, and directly by any
        // other startup step that has to await the schema before it queries a table.
        services.AddSingleton<LorEvolveDatabaseInitializer>();
        services.AddHostedService(provider => provider.GetRequiredService<LorEvolveDatabaseInitializer>());

        return services;
    }

    /// <summary>
    /// Makes a relative SQLite "Data Source" absolute against the content root and ensures
    /// the target directory exists, so the database lands in a predictable place.
    ///
    /// An absolute path is left where it points, which is how a deployment puts the file on
    /// storage that outlives the deployed content instead of inside it.
    /// </summary>
    private static string ResolveDataSourceDirectory(string connectionString, string contentRootPath)
    {
        var sqliteBuilder = new SqliteConnectionStringBuilder(connectionString);
        var dataSource = sqliteBuilder.DataSource;

        if (string.IsNullOrWhiteSpace(dataSource)
            || dataSource.Equals(":memory:", StringComparison.OrdinalIgnoreCase)
            || dataSource.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            return connectionString;
        }

        var absolute = Path.GetFullPath(dataSource, contentRootPath);
        var directory = Path.GetDirectoryName(absolute);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        sqliteBuilder.DataSource = absolute;
        return sqliteBuilder.ToString();
    }
}
