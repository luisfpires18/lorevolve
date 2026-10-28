# Alpha demo page plan

Status: **step 1 built** in `site/alpha/` (feature screenshots still to capture). Step 1 is the page. App email is step 2, a custom domain is parked.

## 1. Decisions so far (owner, 2026-10-28)

- The page is fully independent of the app: own hosting, own storage, no call to the app's API, no shared login.
- No custom domain for now. The page lives on a free `<insert a name>.pages.dev` address. A domain is bought only if
  the alpha succeeds.
- The page sends no email. It only stores each request and its survey answers for the owner to read and act on by
  hand (pick testers, issue sign-up links in the app's Admin workspace).
- Contact address: `lorevolve@gmail.com`.
- Email sending is built in the app later (step 2), not on the page.

## 2. What exists today (checked in code)

- Registration is invitation-only: an Admin issues a sign-up link (`Features/Auth/SignUpLinks.cs`, 7 days, one
  address) and copies it by hand (`AdminEndpoints.cs:149`).
- The app sends no email at all. No password reset either.
- The landing page (`src/LorEvolve.Web/src/pages/LandingPage.tsx`, `.landing*` rules in `styles.css` ~15085-15700)
  uses system fonts, the theme tokens at the top of `styles.css`, one hero painting (`src/assets/atmosphere-citadel.webp`)
  and the brand mark (`public/brand-mark.png`). Copying its look is cheap.

## 3. The page

### 3.1 Content, top to bottom

Plain HTML, CSS and a little JS. No build step, nothing imported from the app.

1. **Hero**, same layout as the landing hero: painting, eyebrow, title, a short paragraph saying what LorEvolve is in
   plain words. One button: "Join the alpha".
2. **What it is**: a few sentences on the idea (one place to build a fictional world and write the stories set in it,
   where everything you record is connected).
3. **What it does, one by one.** One card per feature, each with a screenshot or short muted clip, what it is, and why it
   helps:
   Lore, Lore types, Family Tree, Maps, World Rules, Chronology, Stories, Timeline, Ideas, Progression stages, Public
   portal, AI help (optional, off unless you turn it on).
4. **About the alpha**: small, by invitation, in waves; things will change and break; feedback is the point.
   Button again: "Join the alpha".
5. **Footer**: privacy note, `lorevolve@gmail.com`.

**Copy rules**: written like a person explaining their project to a friend, not marketing. Checked with the
`humanizer` skill before review. No em or en dashes. No franchise names; screenshots show a demo universe with
neutral placeholder names. The owner reviews all copy before it goes live.

### 3.2 Visuals

- Screenshots taken by Claude with Playwright from a local run seeded with a neutral demo universe. WebP, about 1280px
  wide, under ~200 KB each, lazy-loaded, with `alt` text.
- At most two short clips (candidates: Family Tree, Maps): muted, looped, poster frame, still image under
  `prefers-reduced-motion`.
- The live app is never embedded.

### 3.3 Look

Copy, do not import: the theme tokens, light and dark, the base type rules and the `.landing*` rules used, into one
`styles.css`, trimmed. New rules for the feature cards and the modal in the same idiom. Dark follows the system
setting. The copy will not follow later landing changes; accepted for a short-lived page.

### 3.4 The modal

"Join the alpha" opens a native `<dialog>` (focus trap, Escape, backdrop built in). Two steps, **Next** and **Back**
between them, values kept when going back. Nothing is saved until the final **Send**.

**Step 1: about you**

| Field | Input | Rule |
| --- | --- | --- |
| Email | email | required |
| Name | text | required |
| What would you use LorEvolve for? | textarea | required, up to ~1000 characters |
| Consent | checkbox, unticked | required: "You can contact me about the alpha, and I have read the privacy note." |

**Step 2: a short survey** (every answer optional, Send works with all blank)

- How would you prefer to pay for an app like this? Monthly subscription / Pay only for what I use / One-time
  purchase / Other (text).
- At what monthly price would it feel so cheap you would doubt it? (number, EUR)
- At what monthly price would it be too expensive to consider? (number, EUR)
- Anything you would like to see, or any suggestion? (textarea, up to ~2000 characters)

**After Send**: a thank-you screen in the dialog ("You are on the list. Invitations go out in small waves."). On an
error the dialog stays open with everything still typed and says what went wrong.

Phone width, keyboard only and screen reader are checked before review.

### 3.5 Storing the answers

Every value from both steps is stored, plus the time and the consent wording version. No IP address or device data.
Two options; owner picks one:

| | **A. Cloudflare D1** (recommended) | B. Google Sheet |
| --- | --- | --- |
| How | A small Pages Function receives the form and writes one row to a D1 table | The form posts to a Google Apps Script that adds a row to a Sheet owned by `lorevolve@gmail.com` |
| Where you read it | Cloudflare dashboard, D1 console (table view, SQL, CSV export) | Google Sheets, phone included |
| Spam protection | Turnstile (free, cookieless), checked server-side | Turnstile can be checked in the script, but weaker and more fiddly |
| Same email twice | Adds a second row (never overwrites: addresses are not verified) | Adds a second row |
| Data held by | Your Cloudflare account | Your Google account |
| Code to maintain | One function (~80 lines), one table | One script (~40 lines) |

Hosted form tools (Tally, Formspree, Google Forms) are dropped: they cannot drive the custom two-step modal without an
iframe that breaks the branding.

Table or sheet columns: `created_at`, `email`, `name`, `use_case`, `consent_at`, `privacy_version`,
`pay_preference`, `pay_other`, `price_too_cheap`, `price_too_expensive`, `suggestion`, plus two columns the owner fills
by hand: `wave`, `invited_at`.

### 3.6 Privacy

- Basis: consent (the checkbox), wording versioned.
- Privacy note page: who keeps the data (the owner), why (alpha invitations and the survey), what is kept, how long
  (deleted when the alpha ends, or sooner on request), who processes it (Cloudflare, or Google for option B), how to
  ask for a copy or deletion (`lorevolve@gmail.com`).
- Deletion or copy on request: one documented query (or deleting a sheet row).
- No analytics, no cookies, so no cookie banner.

### 3.7 Hosting

- Cloudflare Pages, project `<insert a name>`, address `<insert a name>.pages.dev`.
- **Hidden from search** while link-only: `noindex` in the page head and an `X-Robots-Tag: noindex` header.
- Security headers in `_headers`: a content security policy (self, plus `challenges.cloudflare.com` for Turnstile),
  no framing, no referrer leak.
- **Source**: folder `site/alpha/` in this repo.
- **Deploy**: Cloudflare Pages connected to GitHub (`luisfpires18/lorevolve`), production branch `dev`, root
  `site/alpha`, build watch path `site/alpha/**`. No Cloudflare key in GitHub.

## 4. Owner steps, by hand

Secrets never go in the repo; they live only in the Cloudflare (or Google) dashboard.

1. Cloudflare: create the Pages project from GitHub with the settings in 3.7, pick the project name.
2. Cloudflare: create a Turnstile widget for `<insert a name>.pages.dev`. The site key is public; the secret key goes in
   the Pages project as `TURNSTILE_SECRET`.
3. Option A: create the D1 database, bind it to the Pages project as `DB`, run `schema.sql` (Claude gives the command).
   Option B: create the Sheet and deploy the Apps Script as a web app from `lorevolve@gmail.com` (Claude gives the
   script and the steps).
4. Review and approve: page copy, screenshots, privacy note.

## 5. Claude steps

1. Branch `feat/alpha-demo-page` off `dev`.
2. Seed a neutral demo universe locally; capture screenshots and up to two clips.
3. Build `site/alpha/`: copied look, hero, intro, feature cards, alpha section, footer, two-step modal, privacy note,
   `_headers`, noindex.
4. Storage for the chosen option, with Turnstile check, validation and size limits.
5. Local check with `wrangler pages dev` (Turnstile test keys): send, send twice, missing consent, bad token, Back keeps
   values, phone width, dark, keyboard only, reduced motion.
6. `site/alpha/README.md`: deploy settings, how to read, export and delete answers, how to mark a wave as invited.
7. Commit locally. No push, merge or PR unless asked.

## 6. Later

- **Step 2, app email**: SMTP sender in the API behind `Email__*` settings, off when unset; starts on Gmail SMTP
  (`lorevolve@gmail.com`, app password in App Service settings). Admin "Email link" next to copy; forgot password and
  reset page. Welcome email: owner to decide.
- **Domain bought early (2026-10-28)**: `lorevolve.com`, set up in `custom-domain-plan.md` (apex for this page, not an
  `alpha.` subdomain). Now unblocked, still not built: Cloudflare Email Routing inbox, a real
  `noreply@` sender (Resend or Workspace) with SPF, DKIM and DMARC. Switching the app is a settings change.

## 7. Open decisions

1. Storage: A, Cloudflare D1 (recommended), or B, Google Sheet?
2. Pages project name (it becomes the `.pages.dev` address).
3. Price questions in EUR per month: keep?
