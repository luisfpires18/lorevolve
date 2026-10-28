# Custom domain plan: lorevolve.com

The owner bought `lorevolve.com` at dominios.pt on 2026-10-28, earlier than the alpha plan assumed. Every origin
LorEvolve uses is configuration, so the domain itself needs no code change. A PROD app does: section 4.

## 1. Layout (owner, 2026-10-28)

| Address | What | Where |
| --- | --- | --- |
| `demo.lorevolve.com` | Alpha page (`site/alpha/`) | Cloudflare Pages project `lorevolve` |
| `lorevolve.com` | PROD app | New App Service `prod-lorevolve`, **Basic B1** plan |
| `www.lorevolve.com` | 301 to `lorevolve.com` | Cloudflare redirect rule, never reaches Azure |
| `dev-lorevolve.azurewebsites.net` | DEV, unchanged | Existing Free F1 plan, no custom domain (F1 cannot take one) |

- **DNS on Cloudflare** (Free plan): done 2026-10-28, nameservers `kristina` and `luke.ns.cloudflare.com`. dominios.pt
  stays the registrar; the registrar lock is back on after the change.
- **One domain.** `demo-lorevolve.com` would be a second purchase and a second zone for no gain.
- **Until PROD exists** the apex and `www` send visitors to the demo page with a temporary 302 (2.3). Deleted when PROD
  takes the apex (3.4).
- **Privacy note and footer** do not name the domain: they are served from it. The contact address stays
  `lorevolve@gmail.com` until a `@lorevolve.com` inbox is tested (section 6).
- **`noindex` on the alpha page** stays while it is link-only.
- **DEV keeps** `Mcp__Origin=https://dev-lorevolve.azurewebsites.net` and no `PublicSite__Origin` (ADR 0038). Nothing
  changes for DEV or its MCP connections.

## 2. Owner steps: alpha page on demo.lorevolve.com

1. **Pages**: Workers & Pages > `lorevolve` > Custom domains > Set up a custom domain > `demo.lorevolve.com` > Activate.
2. **Turnstile**: the widget > Hostname management > `demo.lorevolve.com` (done 2026-10-28, with `lorevolve.com`,
   `www.lorevolve.com` and `lorevolve.pages.dev`).
3. **Temporary redirect, until PROD**: DNS > Add record `A` `@` `192.0.2.1` Proxied, and `AAAA` `www` `100::` Proxied
   (reserved addresses, never contacted). Rules > Create rule > Redirect Rule `root to demo`: `Hostname` `is in`
   `lorevolve.com`, `www.lorevolve.com`; dynamic `concat("https://demo.lorevolve.com", http.request.uri.path)`, **302**,
   keep query string.
4. Check: `https://demo.lorevolve.com` loads; a test application lands in D1 (delete it after); the apex and `www` land
   on the demo page.

## 3. Owner steps: PROD on lorevolve.com

Only after the pre-alpha gate is merged (#33 security, #11 recovery, #54 backups) and section 4 is built.

1. **Azure**: a new **Linux B1** plan (a B1 plan is billed whether or not an app runs on it) and an App Service
   `prod-lorevolve`, .NET 10, same region as DEV. `httpsOnly` on. Its own resource group is cleaner (insert a name).
2. **Settings** (app settings, never in a file). PROD has its own database, keys and buckets; nothing is shared with
   DEV.
   - `ASPNETCORE_ENVIRONMENT`, `Hosting__UseForwardedHeaders=true`, `Database`/`DataProtection` paths: as section 4
     decides.
   - `AllowedHosts=prod-lorevolve.azurewebsites.net;lorevolve.com`
   - `Mcp__Origin=https://lorevolve.com`
   - `PublicSite__Origin=https://lorevolve.com`; `PublicSite__AllowIndexing` unset (false) until launch.
   - `Registration__InviteOnly=true`
   - `Media__*` for a new R2 bucket (insert a name), `DatabaseBackup__*` for a new private bucket: PROD must not start
     without backups.
   - `Assistant__*` only if PROD offers the assistant.
   - `PlatformAdmin__OwnerUserId`: set after the owner's own PROD account exists. No Admin exists yet to make a sign-up
     link, so the owner registers first with `Registration__InviteOnly` unset, then turns it on.
3. **Custom domain** `lorevolve.com`: `dev-lorevolve` is not involved.
   - Azure: `prod-lorevolve` > Custom domains > copy the **Custom Domain Verification ID** and the app's **IP address**.
   - Cloudflare DNS, **DNS only (grey cloud)**: delete the placeholder `A @ 192.0.2.1`, add `A` `@` -> the app's IP,
     and `TXT` `asuid` -> the verification ID. A proxied record blocks the managed certificate.
   - Azure: Add custom domain > All other domain services > `lorevolve.com` > App Service Managed Certificate, SNI SSL.
     If issuance fails and the zone has CAA records, add CAA `0 issue "digicert.com"`.
4. **Redirect rule**: edit `root to demo` into `www to root`: `Hostname` equals `www.lorevolve.com`, dynamic
   `concat("https://lorevolve.com", http.request.uri.path)`, **301**. The `www` placeholder stays proxied.
5. Check: `https://lorevolve.com/health` is 200; `/.well-known/oauth-authorization-server` names
   `https://lorevolve.com/` as `issuer`; `https://www.lorevolve.com` lands on the apex; sign up, sign in, upload a
   picture, run a backup from Admin.

## 4. Claude steps for PROD (not built)

1. `deploy-prod.yml`: manual (`workflow_dispatch`) from `master`, the same `ci.yml` validation and package as DEV,
   GitHub environment `prod` (with a required reviewer), its own `AZURE_WEBAPP_NAME`. DEV's every-push deploy is
   unchanged.
2. Owner: a federated credential on the Azure app registration for subject `...:environment:prod`, and the `prod`
   environment variables. The workflow names them.
3. PROD's config file: reuse `AzureDev` (same `/home/data` layout) or add `appsettings.AzureProd.json`. The second
   keeps a later DEV-only setting from leaking into PROD.
4. Runbook `docs/deployment/azure-prod.md`: section 3, the release steps, rollback (redeploy the previous run).
5. Release flow: merge `dev` into `master`, run Deploy PROD.

## 5. MCP connections

PROD is a new origin with its own issuer, so PROD connections start fresh. DEV connections are not affected: DEV's
`Mcp__Origin` does not change.

## 6. Email: now unblocked, not built

Parked in `alpha-demo-page-plan.md` section 6 until a domain existed. With the zone on Cloudflare:

- **Inbox**: Cloudflare Email Routing (free) forwards a `@lorevolve.com` address (insert a name) to
  `lorevolve@gmail.com`. It adds its own MX and SPF records. It only receives; replying as that address needs a sender.
- **`noreply@` sender**: Resend or Google Workspace, with SPF, DKIM and DMARC records in Cloudflare. The app's SMTP
  sender (step 2 of the alpha plan) is still not built.
- When an inbox is live and tested, swap `lorevolve@gmail.com` on the alpha page and in `privacy.html` in one commit.
  A contact address change is not a change in substance, so `PRIVACY_VERSION` stays.
