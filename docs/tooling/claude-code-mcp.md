# Claude Code MCP servers for LoreX (issue #29)

`.mcp.json` at the repository root is the whole setup: five servers, no secret, project-scoped so every LoreX session
gets the same set.

## Acceptance status

**Not fully accepted yet.** Issue #29 is accepted only after the owner has approved the five project servers in Claude
Code and has seen `github` connect with their own fine-grained read-only token (the steps below). Until then:

- **Verified without owner approval** (2026-10-26; Claude Code 2.1.296, Windows 11, Node 22.23.2, Chrome stable):
  `claude mcp list` loads the file and lists all five as "Pending approval"; `microsoft-learn`, `context7`,
  `openai-docs` and `chrome-devtools` each answered `initialize`, `tools/list` and a real `tools/call`; a non-interactive
  `claude -p --mcp-config .mcp.json --strict-mcp-config` run used those four and reported correct results; with no token
  `github` failed on its own (HTTP 400, "Authorization header is badly formatted") while the other four kept working.
- **Verified once with a stand-in credential, not the owner's token:** on the first pass the `github` server was reached
  with the `gh` CLI's existing OAuth token, passed only to the test process. It listed read tools only (`get_*`,
  `list_*`, `search_*`, `issue_read`, `pull_request_read`; nothing that writes, nothing for Actions) and read issue #29.
  That shows the endpoint and headers work; it is not the owner's fine-grained token, which is the acceptance check.

| Server | What it is for | Transport | Auth |
| --- | --- | --- | --- |
| `microsoft-learn` | ASP.NET Core, EF Core, C#, Microsoft.Extensions, Azure docs and code samples (`microsoft_docs_search`, `microsoft_docs_fetch`, `microsoft_code_sample_search`) | HTTP, `https://learn.microsoft.com/api/mcp` | none |
| `context7` | Current third-party library docs - React, Vite, Playwright, npm packages (`resolve-library-id`, then `query-docs`) | HTTP, `https://mcp.context7.com/mcp` | none (anonymous rate limit) |
| `openai-docs` | Responses API, SDK and model docs (`search_openai_docs`, `fetch_openai_doc`, `list_api_endpoints`, `get_openapi_spec`) | HTTP, `https://developers.openai.com/mcp` | none |
| `chrome-devtools` | A live Chrome: console, network, performance traces, accessibility snapshots, responsive emulation, Lighthouse | stdio, `npx -y chrome-devtools-mcp@1.12.0` | none |
| `github` | Read-only repository, issue and pull-request context | HTTP, `https://api.githubcopilot.com/mcp/readonly` | `GITHUB_PERSONAL_ACCESS_TOKEN` from the environment |

All five are maintained by their vendors (Microsoft, Upstash, OpenAI, Google's Chrome DevTools team, GitHub).

## One-time owner steps

1. **Approve the project servers.** Claude Code does not trust a repository's `.mcp.json` until asked: start `claude` in
   the repository (or open `/mcp`) and approve the five servers. Until then `claude mcp list` shows them as
   "Pending approval". Approval is stored in your own Claude Code configuration, never in the repository.
2. **GitHub token (only for `github`).** Create a **fine-grained** personal access token on GitHub limited to the
   repository `luisfpires18/lorex`, with read-only permissions: *Contents: Read*, *Issues: Read*, *Pull requests: Read*
   (*Metadata: Read* is added automatically). Give it no write permission and no Actions permission. Store it as a user
   environment variable, not in a file in the repository:
   - Windows: `setx GITHUB_PERSONAL_ACCESS_TOKEN "<token>"`, then restart the terminal or the Claude desktop app.
   - macOS/Linux: export it from your shell profile.

   Without it the other four servers work as usual and `github` fails to connect on its own (HTTP 400,
   "Authorization header is badly formatted").
4. **Confirm.** `claude mcp list` shows all five "Connected"; in a session, ask Claude to read issue #29 of
   `luisfpires18/lorex` through `github`. That closes the acceptance.
3. **Optional:** a Context7 API key raises its rate limit. Keep it out of the repository: add it to your own local
   scope, for example `claude mcp add --scope local --transport http context7 https://mcp.context7.com/mcp --header
   "CONTEXT7_API_KEY: <key>"`, which overrides the project entry for you only.


## Why it is configured this way

- **GitHub stays read-only and away from CI.** Three layers: the `/readonly` endpoint, the `X-MCP-Readonly: true`
  header, and `X-MCP-Toolsets: repos,issues,pull_requests` - no `actions`, so Claude can neither read nor trigger
  workflows (ChatGPT owns remote CI and merge review). The token is read-only as well. Verified tool list: `get_*`,
  `list_*`, `search_*`, `issue_read`, `pull_request_read` only. The official `github` plugin is *not* used: it points at
  the full read-write endpoint.
- **Chrome is isolated.** `--isolated` gives the browser a temporary profile deleted on close, so it never sees the
  owner's own Chrome profile, cookies or extensions. `--no-usage-statistics` and `--no-performance-crux` keep usage data
  and trace URLs (local addresses included) from going to Google. It opens a visible window by default; add
  `--headless` in a local override if you prefer.
- **Pinned.** `chrome-devtools-mcp@1.12.0` rather than `@latest`, so every session runs what was verified. To update:
  `npm view chrome-devtools-mcp version`, change the pin, run `claude mcp list` and one `take_snapshot`.
- **`.mcp.json`, not plugins.** The vendor plugins (`microsoft-docs`, `context7`, `chrome-devtools-mcp` in
  `claude-plugins-official`) also install skills; plain servers keep the active tool set small, which the issue asks for.
  The plugins are an equivalent per-user alternative for the three no-auth servers.
- **What the docs servers receive** is the search text Claude sends them. Never put universe content, keys or personal
  data in a docs query.

## Not set up (issue #29's later and skipped items)

- **Later, when justified:** Azure MCP (active Azure DEV debugging), NuGet MCP (package and vulnerability upkeep),
  Sentry MCP (once LoreX reports errors to Sentry). The `azure` and `sentry` plugins exist in `claude-plugins-official`.
- **Skipped on purpose:** Playwright MCP, filesystem, SQLite, generic memory and reasoning MCPs. Note: the project's
  `.claude/settings.json` already enables the `playwright` plugin (owner's choice, which brings `@playwright/mcp`); this
  setup does not change it. The Playwright CLI workflow (`tests/Lorex.E2E`) stays the way specs are written and run.

## Re-checking a server by hand

A server can be probed without Claude: `initialize`, `notifications/initialized`, `tools/list`, then one `tools/call`,
over HTTP with `Accept: application/json, text/event-stream` (keep the `Mcp-Session-Id` header the server returns) or
over the stdio of `npx -y chrome-devtools-mcp@1.12.0 --headless`.
