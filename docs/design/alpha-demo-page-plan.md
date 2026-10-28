# Alpha demo page and email plan

Status: **plan only, nothing built.** Waiting for owner approval and the decisions in section 6.

## 1. What exists today (checked in code)

- Registration is invitation-only. An Admin issues a sign-up link (`Features/Auth/SignUpLinks.cs`, Data Protection token,
  7 days, one address). `AdminEndpoints.cs:149` returns the token to the Admin, who copies it and sends it by hand.
- **The app sends no email at all.** No `IEmailSender`, no SMTP, no provider SDK, no password reset, no email
  confirmation. Invitations to a universe are link-only too (security H-1).
- No custom domain. DEV is `dev-lorevolve.azurewebsites.net`. Cloudflare is already used for R2 only.
- The landing page (`src/LorEvolve.Web/src/pages/LandingPage.tsx`, styles `.landing*` at `styles.css` ~15085-15700)
  uses system font stacks (`--display`, `--ui`), the theme tokens at the top of `styles.css`, one hero painting
  (`src/assets/atmosphere-citadel.webp`) and the brand mark (`public/brand-mark.png`). No web fonts, so a copy is cheap.

## 2. The demo page

### 2.1 Shape

One static page, separate from the app. Plain HTML, CSS and a little JS. No React, no build step, no import from
`src/LorEvolve.Web`.

1. **Hero**: same layout and classes as the landing hero (painting under a veil, eyebrow, serif title, lede). One button:
   "Apply for the alpha", which opens the modal. No metrics row (those are live app numbers).
2. **Feature grid**: one card per feature. Each card: a screenshot (or a short muted loop), a title, one line on what
   it is, one line on why it helps. Generic wording only, no franchise names. Cards:
   Lore, Lore types, Family Tree, Maps, World Rules, Chronology, Stories, Timeline, Ideas, Progression stages,
   Public portal, AI help (marked optional).
3. **Closing band**: what the alpha is (small, invite waves, things will break, feedback wanted) and the same
   "Apply for the alpha" button.
4. **Footer**: privacy note link, contact address.

Card copy follows the landing's tone ("Entries with articles, pictures and the fields you design.") and the generic
placeholder rule: the screenshots show a demo universe whose names read like "Insert a name", never real examples.

### 2.2 Visuals

- Screenshots taken by Claude with Playwright from a local run seeded with a generic demo universe. WebP, about 1280px
  wide, under ~200 KB each, `loading="lazy"`, real `width`/`height`, meaningful `alt`.
- At most two short recordings (for example Family Tree and Maps): MP4/WebM, muted, `playsinline`, poster frame, no
  autoplay under `prefers-reduced-motion`, under ~1.5 MB each.
- The live app is never embedded.

### 2.3 Styles

Copy, do not import: the `:root` tokens and `[data-theme='dark']` block, the base type rules, and the `.landing*`
rules the page uses into one `site/alpha/styles.css`, trimmed to what is used. Add `.feature-grid`, `.feature-card` and
`.modal` rules in the same idiom. Dark theme follows `prefers-color-scheme` (no toggle). Copied assets: hero painting,
brand mark, favicons.

Drift: the copy will not follow later landing changes. Accepted for a short-lived alpha page; noted in the page's
README.

### 2.4 The modal (application plus survey)

Native `<dialog>` with `showModal()` (focus trap, Escape, backdrop for free). One form, two fieldsets.

**Alpha application**

| Field | Input | Rule |
| --- | --- | --- |
| Email | `type="email"` | required |
| Name | text | required, what to call them |
| What would you use it for | textarea | required, max ~1000 chars |
| Consent | checkbox | required: agree to be contacted about the alpha and to the privacy note |

Privacy line under the button: who keeps the data, why (alpha invitations and this survey), how long (deleted when
the alpha ends or on request), contact address, link to the privacy note.

**Survey (all optional)**

- How would you prefer to pay? Radio: monthly subscription / pay per service used / one-time purchase / other (text).
- Light Van Westendorp, two number inputs in EUR per month:
  "At what price would it seem so cheap you would doubt the quality?" and
  "At what price would it be too expensive to consider?"
  (Two of the four questions only; enough for a range, not a full price curve.)
- Suggestion: free-text, max ~2000 chars.

After submit: the dialog shows "Thanks, you are on the list" and, if email is set up, a confirmation email goes out.
Errors are shown in the dialog without losing what was typed.

### 2.5 Form backend

| Option | For | Against |
| --- | --- | --- |
| **Pages Function + D1 + Turnstile** (recommended) | Data in the owner's own Cloudflare account; form matches the branding exactly; Turnstile native; can send the confirmation email; free at alpha volume; export by `wrangler d1 export` or a SQL query to CSV | ~100 lines Claude writes and maintains; the owner reads data via the dashboard or wrangler, not a nice UI |
| Tally | No code; good UI; CSV export; EU company | Embedded iframe in the modal, branding only partly ours; spam protection is theirs, not Turnstile; data held by a third party (DPA needed); confirmation email is theirs |
| Formspree | Simple POST from our own form | Free tier limits; data with a third party; reCAPTCHA or theirs, Turnstile not native |
| Google Forms | Free, Sheets export | Off-brand iframe or hacky POST; Google as processor; worst fit for GDPR wording |
| KV instead of D1 | Simpler binding | Survey answers need querying and export; D1 is SQL, KV is not |

**Recommendation: Pages Function (`functions/api/apply.ts`) writing to D1, Turnstile in front.** Smallest thing that
keeps the data with the owner and the page fully on-brand. Fallback if the owner wants zero code: Tally.

Function behaviour:

1. Accept `POST` JSON only, same origin, body under 16 KB.
2. Verify the Turnstile token server-side (`siteverify`), reject otherwise.
3. Validate: email shape, lengths, consent true, numbers in range.
4. Upsert by lowercased email (a second submit updates, never duplicates).
5. Send the confirmation through the noreply sender (section 3), if configured. A send failure does not lose the row.

D1 table `applications`: `id`, `created_at`, `updated_at`, `email` (unique), `name`, `use_case`, `consent_at`,
`privacy_version`, `pay_preference`, `pay_other`, `price_too_cheap`, `price_too_expensive`, `suggestion`, `wave`,
`invited_at`. No IP address, no user agent stored. `wave` and `invited_at` are set by the owner (SQL in the
dashboard) when the sign-up link goes out, so the first five and later waves are tracked in one place.

GDPR:

- Lawful basis: consent (checkbox, unticked by default, its wording versioned in `privacy_version`).
- Privacy note page (`privacy.html`): controller (the owner), purpose, data kept, retention, processors (Cloudflare,
  the email sender), rights and the contact address.
- Access and erasure on request: one SQL `SELECT` / `DELETE` by email, documented in the README.
- Retention: delete the table, or the non-invited rows, when the alpha ends.
- Turnstile is cookieless, so no cookie banner is needed for it. No analytics on the page (Cloudflare Web Analytics
  is cookieless too, if wanted later).

### 2.6 Hosting, domain, indexing

- **Domain**: the owner needs one. Recommended: register the LorEvolve domain on Cloudflare Registrar (at-cost, DNS
  already in Cloudflare, which Pages, Email Routing and Turnstile all want). Placeholder in this doc: `<domain>`.
- **Subdomain**: `alpha.<domain>` for the page (it says what it is and can be retired when the alpha ends). The root
  domain stays free for the real app later.
- **noindex** while link-only: `<meta name="robots" content="noindex, nofollow">` plus `X-Robots-Tag: noindex` in
  `_headers` (covers the `*.pages.dev` preview URLs too). No `robots.txt` Disallow, because that would stop crawlers
  reading the noindex.
- `_headers` also sets a CSP (self plus `challenges.cloudflare.com` for Turnstile), `Referrer-Policy`,
  `X-Content-Type-Options`, `frame-ancestors 'none'`.

### 2.7 Source and deploy

- **Source**: a folder in this repo, `site/alpha/` (`index.html`, `privacy.html`, `styles.css`, `app.js`, `assets/`,
  `functions/api/apply.ts`, `schema.sql`, `wrangler.toml` without secrets, `README.md`). One repo keeps screenshots
  and copy next to the app they describe. A separate repo only pays off if someone else will own the page.
- **Deploy (recommended): Cloudflare Pages Git integration** on `luisfpires18/lorevolve`, production branch `dev`,
  root directory `site/alpha`, no build command, build watch paths `site/alpha/**` so app pushes do not redeploy it.
  No Cloudflare token in GitHub; secrets live in the Pages project settings.
- Alternative: a `wrangler pages deploy` GitHub Action with a `paths` filter. Needs a `CLOUDFLARE_API_TOKEN` repo
  secret and one more workflow; only worth it if the owner wants deploys gated by CI.

## 3. Email

### 3.1 Addresses

Both on the main LorEvolve domain (`<domain>`):

- General inbox: one human-facing address, `<insert a name>@<domain>`.
- Noreply: `noreply@<domain>`, send-only, for automated mail from both the app and the demo page.

### 3.2 General inbox: Cloudflare Email Routing (free)

Receives at `<insert a name>@<domain>` and forwards to the owner's personal inbox. Receive-only: a reply sent from the
personal inbox shows the personal address. If replies must come from the LorEvolve address, add it as a Gmail
"Send mail as" alias using the sender's SMTP (Resend offers SMTP). Optional.

### 3.3 Noreply sender

| Provider | Fit | Notes |
| --- | --- | --- |
| **Resend** (recommended) | Plain HTTPS API, callable from both the Pages Function (`fetch`) and .NET (`HttpClient`, no SDK needed) | Free tier covers alpha volume; DKIM and SPF on a `send.` subdomain so it never clashes with Email Routing's root SPF |
| Azure Communication Services Email | Same cloud as the app, managed identity possible | Needs two Azure resources and domain verification; new resources start with low send quotas; calling it from a Worker needs HMAC request signing |
| Postmark | Best deliverability reputation | Small free tier, then paid; account approval step |
| Amazon SES | Cheapest at volume | Starts in sandbox, production access needs a request; a new AWS account just for this |

**Recommendation: Resend**, one sender for both the app and the demo page. Re-check prices and limits on the provider
page when signing up.

### 3.4 DNS records (all in Cloudflare DNS for `<domain>`)

| Purpose | Record | Added by |
| --- | --- | --- |
| Email Routing receive | `MX` on `<domain>` (3 Cloudflare hosts) | Cloudflare, one click |
| Email Routing SPF | `TXT <domain> "v=spf1 include:_spf.mx.cloudflare.net ~all"` | Cloudflare, one click |
| Resend return path | `MX` and `TXT` SPF on `send.<domain>` | owner, values from Resend |
| Resend DKIM | `TXT resend._domainkey.<domain>` | owner, value from Resend |
| DMARC | `TXT _dmarc.<domain> "v=DMARC1; p=none; rua=mailto:<insert the inbox address>"` | owner |
| Pages | `CNAME alpha` to the Pages project | Cloudflare, when adding the custom domain |

One SPF record per name: the root keeps Cloudflare's, the sender's lives on `send.`, so they never merge. DMARC starts
at `p=none`, moves to `p=quarantine` after a couple of clean weeks of reports.

### 3.5 Who sends what

- Demo page: the confirmation after an application. From the Pages Function.
- App (later, its own change, not part of the page): send the Admin's sign-up link by email instead of copy and paste,
  then universe invitations, then password reset. That needs a small sender in `src/LorEvolve.Api/Features/Email/`
  (one class over `HttpClient`, options `Email__ApiKey`, `Email__From`, off when unset like `DatabaseBackup__*`) and
  App Service settings. Planned separately; not needed to start the alpha because waves are small and the link can
  still be copied by hand.

## 4. Steps the owner does by hand

Secrets never go in committed config. Every key below goes only into the Cloudflare dashboard, Azure App Service
settings, or a local untracked file.

1. Register the domain (recommended on Cloudflare Registrar) or move its DNS to Cloudflare.
2. Cloudflare: Email Routing on, create the inbox address, verify the forward-to address.
3. Cloudflare: Turnstile widget for `alpha.<domain>` (and the `*.pages.dev` host). Copy site key (public, fine to
   commit) and secret key (secret).
4. Cloudflare: create D1 database (name: insert a name). Run `schema.sql` (Claude provides the command).
5. Cloudflare: Pages project from GitHub (`luisfpires18/lorevolve`), production branch `dev`, root `site/alpha`,
   watch paths `site/alpha/**`. Bind D1 as `DB`. Add secrets `TURNSTILE_SECRET` and `RESEND_API_KEY`. Add custom
   domain `alpha.<domain>`.
6. Resend: account, add domain, paste its DNS records into Cloudflare, wait for verification, create a send-only API
   key restricted to that domain.
7. DNS: add the DMARC record.
8. Write or approve the privacy note wording (Claude drafts it) and choose the contact address.
9. Approve the card copy and screenshots.
10. Later, for app email: add `Email__ApiKey` and `Email__From` to the App Service settings.

## 5. Steps Claude does

1. Branch `feat/alpha-demo-page` off `dev`.
2. Seed a generic demo universe locally and capture screenshots and the two short recordings with Playwright.
3. Build `site/alpha/`: copied styles and assets, hero, feature grid, closing band, footer, dialog form, privacy
   note draft, `_headers`, noindex.
4. `functions/api/apply.ts`: Turnstile check, validation, D1 upsert, Resend confirmation. `schema.sql`.
5. Local check with `wrangler pages dev` (Turnstile test keys, local D1): submit, duplicate submit, bad token, missing
   consent, phone width, dark theme, keyboard-only dialog, reduced motion.
6. `site/alpha/README.md`: deploy settings, export and delete queries, how to mark a wave as invited.
7. Commit locally. No push, merge or PR unless asked.
8. Later and separate: the API email sender and "email the sign-up link" in Admin.

## 6. Decisions for the owner

1. Domain: which one, and register on Cloudflare Registrar?
2. Subdomain: `alpha.` (recommended) or another?
3. Form backend: Pages Function + D1 (recommended) or Tally (no code)?
4. Email sender: Resend (recommended) or Azure Communication Services (stay in Azure)?
5. General inbox address: the part before `@`.
6. Send a confirmation email on application: yes (recommended) or no?
7. Currency and unit for the price questions: EUR per month (assumed) or other?
8. Retention: delete applications when the alpha ends (recommended), or keep invited testers' rows?
9. Deploy: Pages Git integration from `dev` (recommended) or a wrangler GitHub Action?
