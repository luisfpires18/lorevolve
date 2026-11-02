namespace LorEvolve.Desktop;

/// <summary>
/// Where the buyer's library lives: <c>%LOCALAPPDATA%\LorEvolve</c>, never the install folder, which Steam or Program
/// Files may make read-only and an update replaces. Everything the app keeps is under it, so it is also the one folder a
/// backup or Steam Cloud needs (ADR 0070).
/// </summary>
internal sealed record DataFolder(string Root)
{
    public string Database => Path.Combine(Root, "lorevolve.db");

    public string Keys => Path.Combine(Root, "keys");

    public string Media => Path.Combine(Root, "media");

    /// <summary>The window's own browser profile: cookies, cache. Not the library; safe to lose.</summary>
    public string WebView => Path.Combine(Root, "webview");

    public static DataFolder Prepare()
    {
        var folder = new DataFolder(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.Create),
            "LorEvolve"));
        Directory.CreateDirectory(folder.Media);
        Directory.CreateDirectory(folder.Keys);
        return folder;
    }
}
