# Custom domain plan: lorevolve.com

The owner bought `lorevolve.com` at dominios.pt on 2026-10-28, earlier than the alpha plan assumed. This plan puts the
alpha page and DEV on it. Nothing here needs a code change: every origin LorEvolve uses is configuration.

## 1. Decisions

| Question | Recommendation | Why |
| --- | --- | --- |
| DNS | **Move the nameservers to Cloudflare** (Free plan) | Pages can only serve the apex when the zone is on Cloudflare; Email Routing needs it too; one dashboard for every record. dominios.pt stays the registrar and keeps billing the renewal. |
| Alpha page | **`demo.lorevolve.com`** (owner, 2026-10-28); `lorevolve.com` and `www` redirect to it with a temporary 302 | The apex stays free for the product page or the prod app later; a 302 is not cached for good, so taking the apex back is one rule deleted. Prod app later: `app.lorevolve.com`. |
| DEV | **`dev.lorevolve.com`**, only if the plan moves to Basic B1 (see 1.1) | Alpha testers are invited onto DEV, so its address is the one they see. |
| `PublicSite__Origin` on DEV | **Leave unset** | ADR 0038: DEV stays out of search indexes. `Mcp__Origin` is the only origin DEV needs. |
| Privacy note and footer | **Do not name the domain** | They are served from it; naming the host adds nothing and would need editing if it moved. The contact address stays `lorevolve@gmail.com` until a `@lorevolve.com` inbox is tested (section 5). |
| `noindex` on the alpha page | **Keep** | The page is still link-only. Removing `X-Robots-Tag` in `_headers` and the meta tag is a separate owner call. |

### 1.1 Blocker for DEV: the Free plan

DEV runs on the Free (F1) App Service plan. F1 cannot take a custom domain at all, and the free App Service managed
certificate needs **Basic (B1) or higher**. Options:

- **A. Scale the plan to B1** (paid, roughly 12 to 13 EUR a month for Linux B1; check the Azure price for the region).
  Custom domain plus free managed certificate, DNS-only record, no other change. B1 also drops F1's daily CPU quota and
  allows Always On. **Recommended if the cost is acceptable.**
- **B. Keep DEV on `dev-lorevolve.azurewebsites.net`** until a paid tier is wanted. Zero cost, zero work; only the alpha
  page moves. Testers see the Azure address.
- Not recommended: proxying `dev.lorevolve.com` through a Cloudflare Worker to the Azure address. It stays free, but
  Cloudflare's Free plan caps a request body at 100 MB (a universe backup restore can be larger), the client IP arrives
  in another header, and it adds a hop to debug.

The rest of this plan assumes A for DEV. With B, skip section 3.

## 2. Owner steps: DNS and the alpha page

Order matters only where a step says so.

1. **Cloudflare**: Add a domain, `lorevolve.com`, Free plan. Review the scanned records: delete any dominios.pt parking
   records (A, AAAA or CNAME on `@` or `www` pointing at dominios.pt, and its MX unless mail is wanted there). Cloudflare
   then shows two nameservers.
2. **dominios.pt**: in the domain's panel, turn **DNSSEC off** if it is on (a stale DS record breaks the move), then
   replace the nameservers with Cloudflare's two. Wait until Cloudflare says the zone is Active (minutes to hours).
3. Optional, after Active: Cloudflare DNS > Settings > enable DNSSEC, and add the DS record it shows at dominios.pt.
4. **Pages**: Workers & Pages > `lorevolve` > Custom domains > Set up a custom domain > `demo.lorevolve.com`.
   Cloudflare adds the record itself.
5. **Placeholder records** so the apex and `www` reach Cloudflare's redirect: DNS > Add record, `A` `@` `192.0.2.1`,
   Proxied; `AAAA` `www` `100::`, Proxied. Both addresses are reserved and never contacted.
6. **Redirect**: Rules > Create rule > Redirect Rule. Custom filter: `Hostname` `is in` `lorevolve.com`,
   `www.lorevolve.com`. Dynamic target `concat("https://demo.lorevolve.com", http.request.uri.path)`, **302**, keep query
   string.
7. **Turnstile**: the widget > Hostname management > add `demo.lorevolve.com`. Keep `lorevolve.pages.dev` so both
   addresses work. Without this step the form refuses every application on the new address.
8. Open `https://demo.lorevolve.com`, send a test application, check it in D1, delete the test row. Open
   `https://lorevolve.com` and `https://www.lorevolve.com`: both land on the demo page.

`lorevolve.pages.dev` keeps working. It is `noindex`, so it competes with nothing.

## 3. Owner steps: DEV on dev.lorevolve.com (option A)

1. **Azure**: the plan `lorex-dev-lfp18-plan` > Scale up > Basic B1.
   `az appservice plan update -g rg-lorex-dev -n lorex-dev-lfp18-plan --sku B1`
2. **Azure**: `dev-lorevolve` > Custom domains > copy the **Custom Domain Verification ID**.
3. **Cloudflare DNS**, both **DNS only (grey cloud)**. A proxied record blocks the managed certificate.
   - `CNAME` `dev` -> `dev-lorevolve.azurewebsites.net`
   - `TXT` `asuid.dev` -> the verification ID
4. **Azure**: Custom domains > Add custom domain > All other domain services, `dev.lorevolve.com`, certificate
   **App Service Managed Certificate**, SNI SSL. Validate, Add. The certificate takes a few minutes. If it fails and the
   zone has CAA records, add CAA `0 issue "digicert.com"`.
5. **Azure app settings** (one save, one restart). Order: only after step 4 shows the binding as Secured.

   ```bash
   az webapp config appsettings set -g rg-lorex-dev -n dev-lorevolve --settings "AllowedHosts=dev-lorevolve.azurewebsites.net;dev.lorevolve.com" "Mcp__Origin=https://dev.lorevolve.com"
   ```

   `AllowedHosts` keeps the Azure host: the deploy workflow's health check calls it, and without the new host every
   request to `dev.lorevolve.com` answers 400.
6. Check:
   - `curl -s https://dev.lorevolve.com/health` answers 200.
   - `curl -s https://dev.lorevolve.com/.well-known/oauth-authorization-server` names `https://dev.lorevolve.com/` as
     `issuer`.
   - Connect to AI in a universe shows `https://dev.lorevolve.com/mcp/universes/<id>`.
7. Reconnect AI apps (section 4) and tell testers the new address.

Nothing else changes: CORS is empty (one origin serves the client and the API), cookies are host-only (no `Domain`),
`httpsOnly` is already set, the GitHub deploy targets the app by name, and `Hosting__UseForwardedHeaders` stays.

### What moves with the address

- **Sign-in**: the session cookie belongs to the host that set it. Everyone signs in once on `dev.lorevolve.com`. The
  Azure address still works with its own session; nothing redirects between them.
- **Installed PWA**: an install is tied to its origin. Install again from the new address and remove the old one.
- **Invitation and sign-up links** already copied keep the address they were made on; they still work there. New ones
  use whatever address the Admin is on.

## 4. MCP connections

The OAuth issuer and every universe's MCP resource URL are built from `Mcp__Origin`. After the switch:

- Every app connected to `https://dev-lorevolve.azurewebsites.net/mcp/universes/<id>` stops working: its tokens name the
  old issuer and resource, so calls and refreshes are refused.
- To reconnect: in Claude, Settings > Connectors, remove the old LorEvolve connector, then Add custom connector with the
  URL Connect to AI now shows, approve on LorEvolve's consent screen (sign in on the new address first). ChatGPT: same,
  as a developer mode connector.
- On LorEvolve, Profile > Connected apps: Disconnect the old entries. They are dead anyway; this only tidies the list.

Do this in the same sitting as step 3.5, so no connector is left half working. Anthropic's servers must reach the new
host; a DNS-only record to App Service is enough.

## 5. Email: now unblocked, not built

Parked in `alpha-demo-page-plan.md` section 6 until a domain existed. With the zone on Cloudflare:

- **Inbox**: Cloudflare Email Routing can forward a `@lorevolve.com` address (insert a name) to `lorevolve@gmail.com`.
  It adds its own MX and SPF records. It only receives; replying as that address needs a sender (next point).
- **`noreply@` sender**: Resend or Google Workspace, with SPF, DKIM and DMARC records in Cloudflare. The app's SMTP
  sender (step 2 of the alpha plan) is still not built.
- When an inbox is live and tested, swap `lorevolve@gmail.com` on the alpha page and in `privacy.html` in one commit.
  A contact address change is not a change in substance, so `PRIVACY_VERSION` stays.

## 6. Claude steps

1. This plan, plus the runbook and README updates on branch `docs/custom-domain-setup` (done).
2. After the owner's steps: run the checks in 3.6 and section 2.8 and record the result in `STATE.md`.
3. Later, on request: email (section 5).
