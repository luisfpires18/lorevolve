# Claude Code MCP servers for LorEvolve (issue #29)

`.mcp.json` at the repository root is the whole setup: four servers, no secret, project-scoped so every LorEvolve session
gets the same set.

## Acceptance status

**Accepted (2026-10-26).** All four servers connect in LorEvolve sessions. Before that they were verified without owner
approval (Claude Code 2.1.296, Windows 11, Node 22.23.2, Chrome stable): `claude mcp list` loaded the file, each server
answered `initialize`, `tools/list` and a real `tools/call`, and a non-interactive
`claude -p --mcp-config .mcp.json --strict-mcp-config` run used them and reported correct results.

| Server | What it is for | Transport | Auth |
| --- | --- | --- | --- |
| `microsoft-learn` | ASP.NET Core, EF Core, C#, Microsoft.Extensions, Azure docs and code samples (`microsoft_docs_search`, `microsoft_docs_fetch`, `microsoft_code_sample_search`) | HTTP, `https://learn.microsoft.com/api/mcp` | none |
| `context7` | Current third-party library docs - React, Vite, Playwright, npm packages (`resolve-library-id`, then `query-docs`) | HTTP, `https://mcp.context7.com/mcp` | none (anonymous rate limit) |
| `openai-docs` | Responses API, SDK and model docs (`search_openai_docs`, `fetch_openai_doc`, `list_api_endpoints`, `get_openapi_spec`) | HTTP, `https://developers.openai.com/mcp` | none |
| `chrome-devtools` | A live Chrome: console, network, performance traces, accessibility snapshots, responsive emulation, Lighthouse | stdio, `npx -y chrome-devtools-mcp@1.12.0` | none |

All four are maintained by their vendors (Microsoft, Upstash, OpenAI, Google's Chrome DevTools team).

## One-time owner steps

1. **Approve the project servers.** Claude Code does not trust a repository's `.mcp.json` until asked: start `claude` in
   the repository (or open `/mcp`) and approve the four servers. Until then `claude mcp list` shows them as
   "Pending approval". Approval is stored in your own Claude Code configuration, never in the repository.
2. **Optional:** a Context7 API key raises its rate limit. Keep it out of the repository: add it to your own local
   scope, for example `claude mcp add --scope local --transport http context7 https://mcp.context7.com/mcp --header
   "CONTEXT7_API_KEY: <key>"`, which overrides the project entry for you only.

## Why it is configured this way

- **No GitHub server.** The issue asked for a read-only GitHub MCP server (`api.githubcopilot.com/mcp/readonly`, needing a
  fine-grained token). It was set up, then dropped by the owner on 2026-10-26: the `gh` CLI is installed and signed in
  and already covers repositories, issues, pull requests and Actions, and without a token the server only failed to
  connect in every session. The trade-off: `gh` runs with the owner's full access, so `.claude/CLAUDE.md` limits its use
  to what the owner asks.
- **Chrome is isolated.** `--isolated` gives the browser a temporary profile deleted on close, so it never sees the
  owner's own Chrome profile, cookies or extensions. `--no-usage-statistics` and `--no-performance-crux` keep usage data
  and trace URLs (local addresses included) from going to Google. It opens a visible window by default; add
  `--headless` in a local override if you prefer.
- **Pinned.** `chrome-devtools-mcp@1.12.0` rather than `@latest`, so every session runs what was verified. To update:
  `npm view chrome-devtools-mcp version`, change the pin, run `claude mcp list` and one `take_snapshot`.
- **`.mcp.json`, not plugins.** The vendor plugins (`microsoft-docs`, `context7`, `chrome-devtools-mcp` in
  `claude-plugins-official`) also install skills; plain servers keep the active tool set small, which the issue asks for.
  The plugins are an equivalent per-user alternative for the three no-auth docs servers.
- **What the docs servers receive** is the search text Claude sends them. Never put universe content, keys or personal
  data in a docs query.

## Not set up (issue #29's later and skipped items)

- **Later, when justified:** Azure MCP (active Azure DEV debugging), NuGet MCP (package and vulnerability upkeep),
  Sentry MCP (once LorEvolve reports errors to Sentry). The `azure` and `sentry` plugins exist in `claude-plugins-official`.
- **Skipped on purpose:** GitHub MCP (above), Playwright MCP, filesystem, SQLite, generic memory and reasoning MCPs.
  Note: the project's `.claude/settings.json` already enables the `playwright` plugin (owner's choice, which brings
  `@playwright/mcp`); this setup does not change it. The Playwright CLI workflow (`tests/LorEvolve.E2E`) stays the way specs
  are written and run.

## Re-checking a server by hand

A server can be probed without Claude: `initialize`, `notifications/initialized`, `tools/list`, then one `tools/call`,
over HTTP with `Accept: application/json, text/event-stream` (keep the `Mcp-Session-Id` header the server returns) or
over the stdio of `npx -y chrome-devtools-mcp@1.12.0 --headless`.
