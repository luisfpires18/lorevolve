# Azure DEV

The DEV environment, end to end. Rationale for the shape lives in
[ADR 0018](../architecture/decisions/0018-azure-dev-single-app-service.md); this file is the
runbook.

DEV only. Nothing here describes production, and nothing here should be reused for it
unchanged.

## Topology

One Azure App Service (Linux) and the plan it runs on. That is the whole environment.

```
                      https://<app-name>.azurewebsites.net
                                    |
                  Azure front end - terminates TLS, forwards http
                                    |
                        App Service (Linux, B1, 1 worker)
                                    |
    dotnet Lorex.Api.dll  ---  wwwroot/  (the built React client)
                                    |
                              /home/data/
                          lorex.db   keys/
```

- **One process serves both halves.** The API is published with the built client in its
  `wwwroot`, so the browser talks to a single origin: no CORS, and the session cookie stays
  same-origin exactly as it does behind the Vite proxy in development.
- **`/home` is persistent.** On Linux App Service it is an Azure Files share mounted into the
  site, and it survives restarts and redeploys. The deployed content directory does not, which
  is why nothing that must last is kept there.
- **One worker, on purpose.** SQLite has one writer. `numberOfWorkers` is 1 and there is no
  autoscale rule; do not add one.

## Prerequisites

- An Azure subscription and a resource group you may deploy into.
- Contributor on that resource group, and enough Entra ID rights to create an app
  registration with a federated credential.
- `az` CLI, signed in (`az login`).
- Admin on the GitHub repository, to create the `dev` environment and its variables.

## Azure resources

Two, both created by [`infra/main.bicep`](../../infra/main.bicep): an App Service plan and the
site. The template declares no secret and outputs none.

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters appName=<globally-unique-app-name>
```

Parameters worth knowing: `appName` (becomes `<appName>.azurewebsites.net`, must be globally
unique), `location` (defaults to the resource group's), `skuName` (`B1` - the smallest tier
with Always On), `linuxFxVersion` (`DOTNETCORE|10.0`), `allowedHosts` (`*` by default) and
`environmentName` (`AzureDev`).

Confirm the runtime exists in your region before deploying, and override `linuxFxVersion` if
it does not:

```bash
az webapp list-runtimes --os linux | grep -i dotnet
```

### Sign-in for the workflow

The deployment signs in with OIDC federated identity, so **no credential is stored in GitHub
or in this repository**. Create an app registration, give it Contributor on the resource
group, and add a federated credential for this repository's `dev` environment (entity type
*Environment*, environment name `dev`). Azure's portal blade for this is
*App registrations -> Certificates & secrets -> Federated credentials*.

## GitHub variables

Repository or `dev`-environment **variables** - not secrets. All four are identifiers, none is
a credential.

| Name | Holds |
| --- | --- |
| `AZURE_CLIENT_ID` | Application (client) ID of the app registration. |
| `AZURE_TENANT_ID` | Directory (tenant) ID. |
| `AZURE_SUBSCRIPTION_ID` | Subscription the resource group is in. |
| `AZURE_WEBAPP_NAME` | The `appName` used above. |

Also create the GitHub environment named `dev`. The deploy job targets it, which is what binds
the federated credential and gives the owner a place to add a required reviewer later.

## Workflows

| File | Runs on | Does |
| --- | --- | --- |
| [`ci.yml`](../../.github/workflows/ci.yml) | Pull requests into `dev`; called by the deploy workflow | Backend Release build, tests in three shards by test class (`scripts/dotnet-test-shard.py`), pending-model check; web typecheck, lint, format, build; Playwright in six parallel shards inside Playwright's container image, each with its own fresh database and report (`tests/Lorex.E2E/README.md`) |
| [`deploy-dev.yml`](../../.github/workflows/deploy-dev.yml) | Push to `dev`, or manual | Calls `ci.yml` and, alongside it, builds the client and publishes the API into an artifact (Package); once both pass, Deploy uploads that artifact and waits for `/health` |

`dev` is the only branch that deploys, and the job is additionally guarded by
`if: github.ref == 'refs/heads/dev'`.

Every job has a `timeout-minutes` well above its usual run (each Backend shard 30, Web 20, each E2E shard 45,
Package 20, Deploy 30), so a hung runner fails instead of holding the queue for GitHub's six hours. Each step
is named for one thing - install, build, test, publish, deploy, health check - so the run's own
step timings show where the time went. Caching stays with `setup-node`'s npm cache: NuGet restore
takes seconds, Chromium comes with the Playwright image, and the client is built again on purpose in Package,
because its version and service-worker cache id come from that run (`LOREX_DEV_RUN`,
`LOREX_BUILD_ID`).

## First deploy

1. Deploy the Bicep template (above).
2. Create the app registration, the federated credential, the `dev` GitHub environment and the
   four variables.
3. Push to `dev`, or run **Deploy DEV** from the Actions tab.
4. The workflow's last step polls `/health` and fails the run if DEV never answers 200.

## The database, and who migrates it

- The connection string lives in `appsettings.AzureDev.json`:
  `Data Source=/home/data/lorex.db`. It is not a secret and there is nothing to hide in it.
- Override it without a redeploy with the app setting `ConnectionStrings__LorexDb`.
- **The app migrates itself at startup.** `LorexDatabaseInitializer` runs before anything
  queries a table, in every environment, and the search-index backfill waits on it. A cold
  start on an empty file therefore builds the whole schema and then serves.
- To hand migrations to something else, set `Database__MigrateOnStartup` to `false`. The app
  will then start against whatever schema it finds, and say so in its log.
- `/home/data` outlives redeploys, so authored lore survives them. It does **not** outlive
  deleting the App Service.

## Data Protection

`DataProtection__KeyRingPath` defaults to `/home/data/keys`. The key ring is what encrypts the
session cookie; keeping it on `/home` is what stops a restart from signing everyone out.

The keys are written **unencrypted at rest**, protected only by the file system - App Service
logs `No XML encryptor configured` on every start to say so. That is accepted for DEV. See
Limitations.

## Which version DEV is running

The home page footer and the account menu show `LoreX v0.1.N-dev`. `N` comes from the Deploy DEV
run number (`src/Lorex.Web/devVersion.ts`): run 101 is `0.1.1-dev`, run 102 is `0.1.2-dev`, and
so on. Nobody bumps it and no commit records it.

- Every run gets a new, higher number, including a failed run and a rollback run that builds an
  older commit. A version that never reached Azure is skipped, never reused.
- Re-running a run keeps its version. Only the build id changes
  (`dev-<run>.<attempt>-<sha>`), so the service worker still starts a fresh cache.
- Local builds and CI show `package.json`'s version unchanged, with no `-dev`. A release is
  whatever `package.json` says.
- When `package.json`'s version changes, set `DEV_RUN_BASELINE` in `devVersion.ts` to the
  latest Deploy DEV run number in the same commit. If the baseline is not below the run number,
  the build fails rather than show a version again.

## Redeploy and rollback

- **Redeploy:** push to `dev`, or re-run the workflow. The site restarts; `/home/data` is
  untouched.
- **Roll back:** re-run the **Deploy DEV** workflow from the last good commit
  (Actions -> Deploy DEV -> Run workflow, choosing that ref), or use App Service's own
  deployment history: `az webapp deployment list-publishing-profiles` shows what is deployed,
  and the portal's *Deployment Center -> Logs* can redeploy a previous package.
- **A rollback does not roll the database back.** Migrations are forward-only and there is no
  down-migration path, so a deployment that adds a migration cannot be undone by redeploying
  the previous build. Restore from a backup instead - see below.
- **Backup:** the whole database is backed up daily to a private R2 bucket once the `DatabaseBackup__*` settings exist
  (issue #54, ADR 0064): setup, status, retention, the restore drill and the restore procedure are in
  [../recovery/database-backups.md](../recovery/database-backups.md). Creators back up and export single universes from
  Settings > Data ([../recovery/universe-recovery.md](../recovery/universe-recovery.md)). Never copy the live `.db` file
  out by hand while the site runs: it can miss what is still in the WAL.

## Known DEV limitations

Accepted deliberately. Each one is a reason this topology is not a production topology.

- **SQLite on an SMB share.** `/home` is Azure Files. SQLite's locking over SMB is weaker than
  on local disk, and a second writer could corrupt the file. Mitigated by one worker and no
  autoscale, not by anything in the code.
- **One instance means downtime on deploy.** No slots, no zero-downtime swap. A redeploy is a
  short outage.
- **Data Protection keys are unencrypted at rest**, with no rotation policy and no Key Vault.
  Anyone who can read `/home/data/keys` can forge a session cookie.
- **Database backups are off until configured.** With the `DatabaseBackup__*` settings they run daily from the web
  process to R2 (ADR 0064); without them the per-universe archive, taken by hand, is the only backup. Pictures are never in
  a database backup - they stay in the media bucket ([../recovery/database-backups.md](../recovery/database-backups.md)). A validated upload waits up to 30 minutes in the site's local temp folder -
  not on `/home` - so a restart or redeploy in between asks the author to choose the file again.
- **`AllowedHosts` is `*` by default.** Narrow it to the site hostname
  (`az webapp config appsettings set --settings AllowedHosts=<app-name>.azurewebsites.net`)
  once DEV is reachable; adding a custom domain later means updating it again.
- **Migrations run on the web process.** A long migration delays the first response after a
  deploy, and two instances would race - another reason there is only one.
- **Nothing works offline.** The service worker caches build output only, by design - ADR 0017.
- **Entry images need Cloudflare R2, which is a separate owner setup.** Until the bucket, the
  token and the five `Media__*` app settings exist, every image route answers 503 and nothing
  else is affected. Steps, config keys and limitations: [cloudflare-r2.md](cloudflare-r2.md).
- **The universe assistant is off until it is given a model.** With no `Assistant__*` app settings it says it is not
  set up and nothing else is affected. To turn it on, set `Assistant__Provider=OpenAI`, `Assistant__OpenAI__Model` to
  the model to use and `Assistant__OpenAI__ApiKey` to the key, as app settings, never in a file. The universe content a
  question needs is then sent to OpenAI (`store: false`). Groq instead, at no cost on its free tier:
  `Assistant__Provider=Groq`, `Assistant__Groq__Model=openai/gpt-oss-120b` and `Assistant__Groq__ApiKey`; the content
  then goes to Groq, whose Responses API takes no `store` setting, so none is sent. Never set `Assistant__Provider=Fake` on a deployed host: it
  is the test stand-in. An OpenAI account with no credit answers every question with "couldn't answer" (logged as
  `insufficient_quota`), not "busy". ADR 0045.
- **Connect to AI is off until `Mcp__Origin` is set** (see below). Its OAuth tables share the one SQLite writer: a
  token refresh writes, and "last used" writes at most every five minutes per connection. Whoever can read
  `/home/data/keys` can read token payloads, as they can already forge a session.
- **A backup is a ZIP, and it does carry image bytes.** The per-universe export is
  `backup.json` plus every entry's original picture, so it does not depend on R2 surviving -
  ADR 0014. It is still a manual, per-universe download and still not a disaster-recovery story.

## Connect to AI over MCP (ADR 0046)

Off until DEV is given its own origin. With no `Mcp__Origin` (and no `PublicSite__Origin`), Connect to AI says it is not
set up, no MCP, OAuth or discovery endpoint exists (those paths fall through to the app shell like any unknown page),
and nothing else is affected.

To turn it on, set one app setting, never in a file:

- `Mcp__Origin=https://<app-name>.azurewebsites.net` - the site's own HTTPS origin, no path. It becomes the OAuth issuer
  and the start of every universe's MCP URL. Setting it does not touch indexing or canonical URLs (that is
  `PublicSite__Origin`). A custom domain later means changing it, and every app connected before has to connect again.

Nothing else is needed: no secret, no certificate, no extra resource. Tokens are protected by the Data Protection key ring
already on `/home/data/keys`, and the OAuth tables live in the same SQLite file, so connections survive restarts and
redeploys. `Hosting__UseForwardedHeaders=true` (already set) is what lets the authorization server see HTTPS behind App
Service; without it every OAuth request is refused as plain HTTP. Optional: `Mcp__RegistrationsPerMinute` (default 30).

Check it after a deploy:

- `curl -s https://<host>/.well-known/oauth-authorization-server` names `https://<host>/` as `issuer`.
- `curl -si -X POST https://<host>/mcp/universes/00000000-0000-0000-0000-000000000000` answers `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp/universes/..."`.
- In a universe, Connect to AI shows `https://<host>/mcp/universes/<id>`. Add it in Claude (Settings, Connectors, Add
  custom connector) or ChatGPT (a connector in developer mode); the browser opens LoreX's consent screen; approve; ask
  the app to call `get_universe_overview`. Profile, Connected apps lists it; Disconnect ends it.

The site must be reachable from the internet for Claude and ChatGPT: their servers fetch the discovery documents and call
the MCP endpoint (Anthropic from `160.79.104.0/21`). Access restrictions on the App Service would break that.

## Provision the owner's Admin account (ADR 0059)

LoreX Admin (`/admin`) is closed to everyone until the server names its Admin. There is only ever one Admin: the
account this setting names. Nothing in the app grants the role, and a username, email or display name is never matched:
only the account's immutable id.

1. Sign in on DEV as the owner's existing account. In the same browser, open `https://<host>/api/auth/me` and copy `id`
   - that is the verified id of the account the session belongs to. Do not take an id from anywhere else.
2. Set one app setting, never in a file: `PlatformAdmin__OwnerUserId=<that id>`. Saving it restarts the site.
3. The log says `Platform Admin granted to account <id> from configuration.` (or nothing, if it already was). If another
   account was Admin, it also says it is a Member again. `PlatformAdmin:OwnerUserId names no account. No account is
   Admin.` means the id is wrong: fix it and restart.
4. Reload LoreX: the account menu offers LoreX Admin, and `/api/auth/me` says `"isAdmin": true`.

Keep the setting: every start re-applies it and changes nothing more. Changing it to another account's id moves the role
there at the restart and makes the previous account a Member - never two Admins (the database refuses a second one).
Removing it leaves the last configured account as the one Admin; taking the role away entirely is a database change
(`PlatformRole = 0` on that `AspNetUsers` row), effective at the next request. Locally, the same setting goes in user secrets (`dotnet user-secrets set PlatformAdmin:OwnerUserId <id>`).

## Search indexing (ADR 0038)

DEV sets no `PublicSite__Origin` and no `PublicSite__AllowIndexing`, on purpose: `robots.txt` answers `Disallow: /`,
every page says `noindex`, `/sitemap.xml` is 404, and no canonical or `og:url` is emitted. Page titles and descriptions
are still written server-side. A production deployment sets both as app settings - `PublicSite__Origin` to its own
`https://` origin (no path) and `PublicSite__AllowIndexing=true` - and needs no code change. Never point a DEV host's
setting at the production origin. Check with `curl -s https://<host>/worlds/<slug> | grep -E "<title>|canonical|robots"`.

## Verifying the PWA

Over HTTPS, which the site is (`httpsOnly` is set), from a Chromium browser:

1. Open `https://<app-name>.azurewebsites.net/`. DevTools -> Application -> Manifest should
   show `Lorex`, `standalone`, start URL `/explore`, id `/app`, and four icons that all load.
2. Application -> Service workers should show `sw.js` **activated** with scope `/`.
3. Application -> Cache storage should hold only `lorex-static-v4`, containing `/assets/...` and
   root icons - **never** `/manifest.webmanifest` and never anything under `/api`. An older
   `lorex-static-v3` still there means the new worker has not activated yet: reload once.

### The installed app's front door (manual, on a device)

The automated suite proves the worker, the manifest and the routes; only a device proves an install. On an install
made before UI refinement 014, open Lorex once in the browser first so the v4 worker activates, then:

1. Close the installed app completely (remove it from recent apps).
2. Launch it from its icon, signed out: it opens **Explore**, not Login.
3. Sign in from Explore's Log in: it returns to Explore. Choose My workspace, open a universe, close the app completely.
4. Launch it from its icon again: it opens **Explore** with "My workspace" offered, not the universe.
5. If step 2 or 4 still opens the workspace or Login, the platform has not yet applied the new manifest (Android checks
   about daily and applies it on a later launch); uninstall and reinstall, then repeat. A new install reads the current
   manifest at once.
4. The install affordance appears in the address bar. It will not on plain HTTP; installability
   needs a secure context.

## Startup troubleshooting

Read the log first: `az webapp log tail --name <app-name> --resource-group <resource-group>`.

| What you see | What it means |
| --- | --- |
| `Applying N migration(s) to '/home/data/lorex.db'` | Normal cold start on a new or upgraded database. |
| `Database schema at '...' is up to date` | Normal restart. |
| `SQLite Error 1: 'no such table: Entities'` | The schema was not applied before startup work ran. Check `Database__MigrateOnStartup`; if it is `false`, something else owes the migration. |
| `Database__MigrateOnStartup is false: starting ... without applying migrations` | Deliberate. Remove the app setting to hand the job back to the app. |
| `SQLite Error 14: 'unable to open database file'` | `/home/data` is not writable, or the path in `ConnectionStrings__LorexDb` is wrong. |
| `No XML encryptor configured` | Expected. See Data Protection above. |
| Sessions dropped after every restart | `DataProtection__KeyRingPath` is unset or points somewhere ephemeral. |
| A 400 on every request | `AllowedHosts` does not match the hostname being used. |
| The app shell loads but every API call 404s | `wwwroot` was published but the API routes were not - check the publish step, not the client. |

## Running the deployed shape locally

Same two commands the workflow runs, which is the point of it being two commands:

```bash
npm --prefix src/Lorex.Web ci && npm --prefix src/Lorex.Web run build
```

```bash
rm -rf src/Lorex.Api/wwwroot && mkdir -p src/Lorex.Api/wwwroot && cp -r src/Lorex.Web/dist/. src/Lorex.Api/wwwroot/ && dotnet run --project src/Lorex.Api --no-launch-profile
```

`src/Lorex.Api/wwwroot` is build output and is gitignored. Set `ASPNETCORE_ENVIRONMENT`,
`ConnectionStrings__LorexDb` and `DataProtection__KeyRingPath` to try the deployed
configuration without writing to the paths App Service uses.

A Release build made while `wwwroot` held a copied client leaves
`bin/Release/net10.0/Lorex.Api.staticwebassets.runtime.json` naming that folder, and a later build does not remove
it. Once `wwwroot` is gone, a local `dotnet ef migrations has-pending-model-changes --configuration Release` fails
with `Error: ...\src\Lorex.Api\wwwroot\` and then cannot create `LorexDbContext`. It is a stale local file, not the
repository - CI's clean checkout never has it. `dotnet clean src/Lorex.Api -c Release` (or deleting that file) clears
it; nothing in hosting needs to change.
