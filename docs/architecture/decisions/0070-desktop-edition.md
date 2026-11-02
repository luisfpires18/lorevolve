# ADR 0070 - A desktop edition: one-time purchase, local first, same repository

Status: accepted (2026-11-02).

## Context

The owner wants LorEvolve to earn money without running costs, and expects people will not pay for a subscription. A
desktop app sold once (Steam, itch.io, Microsoft Store) costs nothing to run: the buyer's disk holds the data and the
pictures, and the buyer's own machine runs the AI. The web app stays live, unchanged, because it is too soon to choose
one over the other.

Most of the host already fits. It is one process on one origin (`FrontendHosting`), the database is SQLite, and every
outside service is picked by configuration and stays off when unset: R2, Resend, the assistant, MCP, SEO.

## Decision

**One repository, one API, an environment named `Desktop`.** The desktop app runs the same `LorEvolve.Api` with
`ASPNETCORE_ENVIRONMENT=Desktop`, configured by `appsettings.Desktop.json` and the shell, as AzureDev and AzureProd are
configured today. `DesktopEdition.IsDesktop` is the one test. Nothing is deleted from the web edition.

**Web-only surfaces are not mapped in Desktop:** the public portal and its API (`/api/public/*`), publishing, artwork,
public name and author, SEO (`robots.txt`, `sitemap.xml`, the server-written head), admin, registration, login, password
reset, collaborators and invitations, feedback reports (the owner cannot read a buyer's database). The client fallback
is the plain built `index.html`. Their tables and columns stay; nothing in Desktop sets them.

**One local account, no login screen.** On first start the host creates one account. The shell starts the host with a
random per-launch token (`Desktop:LaunchToken`) and opens `/desktop/launch?token=...`; that route checks the token in
constant time and signs the local account in. Every other route keeps its `RequireAuthorization()` and its ownership
checks. Kestrel listens on `127.0.0.1` only, and `AllowedHosts` lists only the loopback names, so ASP.NET Core's own
host filtering refuses a web page that rebinds its DNS name to 127.0.0.1 before anything answers. The local account's storage allowance is 1 TiB: the
buyer's disk is the limit, not a price.

**Plain HTTP on loopback.** Desktop, like Development and the test host, serves plain HTTP, so the session cookie drops
`__Host-` and Secure there, and MCP may use an `http://127.0.0.1` origin. `DesktopEdition.ServesPlainHttp` is the one
rule all three places read.

**Pictures on disk.** `Media:Provider=FileSystem` stores each object as a file under `Media:FileSystem:Root`, written to
a temporary name and renamed into place, its content type read from its key's extension (every key LorEvolve writes
ends in one).

**MCP waits for its own phase.** The owner wants it kept, and plain HTTP on loopback is already allowed for it. But an MCP
client's OAuth consent opens in the system browser, which holds no desktop session and has no login screen to reach,
and the shell's port changes every launch while a client remembers one address. Until a phase settles both (a fixed
port, and a consent the desktop window approves), the shell leaves `Mcp:Origin` unset, so MCP is off. Cloud connectors
(claude.ai, ChatGPT) could never reach a loopback address anyway; only local clients are in scope.

**Collaborators stay web-only for now.** A desktop library lives on one PC with no server another person can reach.
Exposing it on a network would bring back login, TLS and invitation email. A LAN mode is a later decision.

**The shell is `LorEvolve.Desktop`:** a Windows Forms window around WebView2, which every Windows 10 and 11 machine
already has. It starts the API in the same process on a free loopback port, so closing the window ends the server with
no orphaned process. The data folder is `%LOCALAPPDATA%\LorEvolve`. One instance at a time.

## Later phases, not decided here

- MCP for local clients (above).
- Local AI: an OpenAI-compatible provider pointed at Ollama or LM Studio, chosen in a desktop Settings screen.
- Cloud at no cost to the owner: Steam Auto-Cloud on the data folder; a data folder the buyer may move into OneDrive or
  Dropbox, with a lock file so two machines never open it at once; scheduled backups to a chosen folder.
- Store builds: Steam (SteamPipe), itch.io (butler), Microsoft Store (MSIX). DRM-free.

## Consequences

- The client has a desktop build (`__LOREVOLVE_EDITION__`, `IS_DESKTOP`) without the portal, sign-in, publishing,
  collaborator, admin and connected-app screens. The portal's lazy chunks are still emitted, never requested.
- `Program.cs` becomes `LorEvolveHost.Build`, shared by the Api's `Program` and the desktop shell.
- A token in a URL is visible to anything that can read the shell's own process; it signs in nothing once the process
  ends, and a new launch makes a new one.
- Steam may refuse a non-game app. itch.io and the Microsoft Store are the fallback.
