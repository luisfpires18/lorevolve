using System.Diagnostics;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LorEvolve.Desktop;

/// <summary>
/// The one window: WebView2 onto the loopback host. Only the host's own origin opens inside it; any other link opens
/// in the buyer's browser, so the window never becomes a browser of its own.
/// </summary>
internal sealed class MainWindow : Form
{
    private readonly WebView2 _view = new() { Dock = DockStyle.Fill };
    private readonly Uri _origin;
    private readonly string _launchUrl;
    private readonly string _profileFolder;

    public MainWindow(Uri origin, string launchUrl, string profileFolder)
    {
        _origin = origin;
        _launchUrl = launchUrl;
        _profileFolder = profileFolder;

        Text = "LorEvolve";
        using (var icon = typeof(MainWindow).Assembly.GetManifestResourceStream("LorEvolve.Desktop.lorevolve.ico"))
        {
            Icon = icon is null ? null : new Icon(icon);
        }

        MinimumSize = new Size(800, 560);
        Size = new Size(1360, 880);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(_view);
        Load += async (_, _) => await OpenAsync();
    }

    public void BringForward()
    {
        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        Activate();
    }

    private async Task OpenAsync()
    {
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: _profileFolder);
            await _view.EnsureCoreWebView2Async(environment);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "LorEvolve needs Microsoft Edge WebView2, which this computer does not have. Install it from "
                + "https://go.microsoft.com/fwlink/p/?LinkId=2124703 and open LorEvolve again.",
                "LorEvolve",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
            return;
        }

        var core = _view.CoreWebView2;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.NavigationStarting += (_, navigation) =>
        {
            if (!IsOwn(navigation.Uri))
            {
                navigation.Cancel = true;
                OpenOutside(navigation.Uri);
            }
        };
        core.NewWindowRequested += (_, request) =>
        {
            request.Handled = true;
            if (IsOwn(request.Uri))
            {
                core.Navigate(request.Uri);
            }
            else
            {
                OpenOutside(request.Uri);
            }
        };
        core.DocumentTitleChanged += (_, _) => Text = string.IsNullOrWhiteSpace(core.DocumentTitle) ? "LorEvolve" : core.DocumentTitle;

        core.Navigate(_launchUrl);
    }

    private bool IsOwn(string uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed)
        && (parsed.Scheme is "about" or "data" or "blob"
            || Uri.Compare(parsed, _origin, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0);

    /// <summary>The buyer's own browser, for web addresses only: never a file, a program or another scheme.</summary>
    private static void OpenOutside(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var parsed) && parsed.Scheme is "https" or "http" or "mailto")
        {
            Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true });
        }
    }
}
