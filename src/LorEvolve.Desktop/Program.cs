using System.Security.Cryptography;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LorEvolve.Desktop;

/// <summary>
/// The desktop edition (ADR 0070): one instance, the API host started in this process on a free loopback port against
/// the data folder, then one window onto it. Closing the window stops the host; nothing outlives the process.
/// </summary>
internal static class Program
{
    private const string InstanceName = "LorEvolve.Desktop";

    [STAThread]
    private static int Main()
    {
        // A second launch only brings the open window forward.
        using var instance = new Mutex(initiallyOwned: true, @"Local\" + InstanceName, out var first);
        using var focus = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\" + InstanceName + ".Focus");
        if (!first)
        {
            focus.Set();
            return 0;
        }

        ApplicationConfiguration.Initialize();

        var data = DataFolder.Prepare();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

        WebApplication host;
        string origin;
        try
        {
            host = LorEvolveHost.Build(
            [
                "--environment", DesktopEdition.EnvironmentName,
                "--contentRoot", AppContext.BaseDirectory,
                "--urls", "http://127.0.0.1:0",
                "--ConnectionStrings:LorEvolveDb", $"Data Source={data.Database}",
                "--DataProtection:KeyRingPath", data.Keys,
                "--Media:FileSystem:Root", data.Media,
                "--" + DesktopLaunch.TokenKey, token,
            ]);
            host.StartAsync().GetAwaiter().GetResult();
            origin = host.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                $"LorEvolve could not start.\n\n{exception.Message}\n\nYour data folder: {data.Root}",
                "LorEvolve",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        try
        {
            using var window = new MainWindow(new Uri(origin), $"{origin}{DesktopLaunch.LaunchPath}?token={token}", data.WebView);
            var listening = ThreadPool.RegisterWaitForSingleObject(
                focus, (_, _) => window.BeginInvoke(window.BringForward), null, Timeout.Infinite, executeOnlyOnce: false);
            Application.Run(window);
            listening.Unregister(null);
            return 0;
        }
        finally
        {
            host.StopAsync().GetAwaiter().GetResult();
            ((IDisposable)host).Dispose();
        }
    }
}
