# Installed LorEvolve (PWA): what is tested by automation, what is simulated, and what only a device proves

Issue #58. LorEvolve installs (ADR 0017): a manifest, icons and a service worker that caches build output only. Nothing
works offline, by design. This page separates three kinds of evidence, because a green browser suite is not proof of an
installed app, and says which is which for every check.

## 1. What automation proves (Playwright, Chromium, `tests/LorEvolve.E2E`)

Run in CI on every pull request into `dev`.

| Check | Spec | Evidence |
| --- | --- | --- |
| Manifest served and well formed; icons resolve at their sizes; maskable safe zone; head metadata | `pwa.spec.ts` | installability |
| Service worker never keeps `/api`, `/health`, navigations or the manifest; per-build cache; stale cache dropped | `pwa.spec.ts` | update and privacy policy |
| Launch layer on an installed launch; lifts; no replay on reload; nothing in a tab; reduced motion | `launch.spec.ts` | installed first paint |
| Lore category menu on a phone: one labelled control, every type in it, focus, Escape, Filters fold | `type-filter.spec.ts`, `lore-categories.spec.ts`, `mobile.spec.ts` | browser at 390 px |
| Standalone Lore: choose a category, load its actual entries, switch category and show only the new results | `pwa-standalone.spec.ts` | seeded API data, 390 px touch viewport, Chromium standalone simulation |
| Entry authoring, drawers, pickers, no sideways scroll at 390 px | `mobile.spec.ts`, `entity-page.spec.ts` | browser at 390 px |

## 2. What is simulated (`pwa-standalone.spec.ts`) - a browser standing in for an installed window

The page is answered as an installed window answers it before any script runs: `matchMedia('(display-mode:
standalone)')` matches, `navigator.standalone` is true, the viewport is a phone with touch, and a notched phone's safe
areas are asked for through the DevTools protocol (`Emulation.setSafeAreaInsetsOverride`; the test measures what
`env(safe-area-inset-top)` then resolves to and records it as an annotation, so a Chromium without it never passes
silently as if it had them).

Proved under that simulation, on 2026-10-25 against the worktree build (3/3 passed; the annotation recorded
`env(safe-area-inset-top)` as **0** - the bundled Chromium 1.63 did not apply the override, so the sticky bar's
status-bar padding was not exercised and stays a device check):

- The launch layer draws and lifts, leaving nothing over the page.
- The Lore browser's **Category** menu (`lore-type-menu`) is on screen under the sticky bar, nothing covers it
  (`elementFromPoint` on its centre is the control), it opens inside the viewport with its first item focused, a tap
  chooses a category, the address carries `?type=`, the list is that category's; the choice survives a reload in the same
  window and a fresh launch of the same address in a new window.
- The entry form's **Type** picker (`<select aria-label="Entry type">`) is uncovered, changes to another type, the saved
  entry has that type according to the API, and the type is still that after a reload and in the edit form.
- With the list scrolled to its foot and Filters opened, typed into and closed (the virtual keyboard would have been up),
  the Category menu still opens on screen and chooses.

**What the simulation cannot show:** WebKit (every iOS browser and Home Screen web app is WebKit), the OS's own
`<select>` sheet, gesture navigation, a Home Screen app's separate cookie jar, suspension and resume, an OS update
prompt, a real status bar. A green run here is a regression check on the CSS and the controls, not an installed-app
pass.

## 3. Reported problem and its reproduction status

Owner report (2026-10-25, reopened 2026-10-26): in the installed/mobile Lore experience, no Lore entities appear. The original report described being unable to choose a category.

- **Control identified.** "Category" is Lore's type selector. On a phone (≤ 640 px) it is the **Category** button
  (`TypeSwitcher`, an `ActionMenu` with a panel of links) on the Lore browser; on an entry's form it is the **Type**
  `<select>`; Quick Create's dialog has the same `<select>` inside a modal `<dialog>` when more than one type is
  eligible. Above 640 px the categories are a row of links.
- **Browser, same viewport:** category selection and entity rendering pass in Chromium (the specs in §1 and §2, 390 x 844 with touch).
- **Simulated installed window:** choosing Character renders its seeded Character entry; switching to Location renders its Location entry and removes the Character result (`pwa-standalone.spec.ts`). This local reproduction passes, so the reported missing-entities failure has not been reproduced in Chromium.
- **Real installed app:** **unverified** - no iOS, Android or desktop install was available to this run. The device,
  OS, browser, install path and display mode of the report are not recorded in the issue.

Nothing in the category or entity-loading code paths differs on `display-mode: standalone` except the launch layer, which
the simulation covers and which removes itself (and goes inert after 10 s even if it could not). The new seeded-data
journey confirms that category selection requests and renders the intended entries in this simulation. It does not
establish that the owner’s installed app is running the same deployed build or reproduce platform-specific WebKit
behavior. Keep the real-device row open until the reporting device and build are checked against §4.

## 4. Manual checklist - real installed app (mark each row verified, failed or not available)

Record for every platform: device and OS version, browser and version, how it was installed, `display-mode` as shown by
the app (open the Assistant drawer's About, or the browser's own dev tools), viewport size (`innerWidth x innerHeight`),
signed-in account, and the exact screen.

### 4.1 The reported path - do this first, on the reporting device

1. Install LorEvolve from the browser (Safari: Share > Add to Home Screen; Chrome: Install app / Add to Home screen;
   desktop Chrome/Edge: the install icon in the address bar).
2. Launch from the icon. Expect: black launch screen with the logo, then Explore.
3. Sign in. Open a universe > Lore. Expect: "Choose a category to browse your lore." and the **Category** button.
4. Tap Category. Expect: a menu with every type, the first type focused, inside the screen. Tap a type that has known
   entries. Expect: the title is that type, the address ends `?type=<id>`, and its entries appear. Switch to a second
   type with a known entry; expect only that type's entries. Return to the first type and verify it loads again.
5. If step 4 fails: note whether the menu opened at all, whether it opened off screen, whether a tap on a type did
   nothing, and whether the same device in the ordinary browser at the same screen does the same. Screenshot both.
   Then try: rotate to landscape and back; scroll the page a little and retry; close and relaunch the app; sign out
   and in.
6. New entry (the "New …" button): change the Type picker. Expect: the OS picker opens, a choice sticks, Create entry
   saves it, the entry page shows that type, and it is still that type after relaunch.
7. Edit an entry with a link field that offers "Create …" (Quick Create): the dialog's Type `<select>` opens and a
   choice sticks (iOS: the picker must appear above the dialog).

### 4.2 Platforms

| Platform | Install path | Status |
| --- | --- | --- |
| iOS / iPadOS Safari, Home Screen web app | Share > Add to Home Screen | **unverified** |
| Android Chrome, installed PWA | Install app (WebAPK) | **unverified** |
| Desktop Chrome or Edge, installed | Address bar install | **unverified** |
| Azure DEV (`https://lorex-dev-lfp18.azurewebsites.net`) as the origin for all three | - | **unverified** |

### 4.3 Journeys per platform

- **Navigation:** every section in the sheet (Sections button on a phone), back and forward gestures, a deep link
  opened from another app lands inside the installed app, the sticky bar clears the status bar (notch) and the
  bottom buttons clear the home indicator.
- **Lore:** browse, search, Filters, category and subtype menus, create and edit an entry, custom fields, relations,
  picture upload from the camera roll and the crop dialog, the image viewer, dialogs and confirmations.
- **Stories, Scenes, Manuscript, Timeline, Ideas:** create, edit, navigate; the editor keeps the caret in view above the
  keyboard; drafts recovered after a crash or a kill (content recovery, ADR 0029) - never "offline editing", which
  LorEvolve does not have.
- **Session:** launch while signed in; resume after 10 minutes and after an hour in the background; a session expired
  on the server sends to sign-in and back; a connection revoked in Connected Apps stops that app; a sign-out in the
  browser does not sign the installed app out (separate cookie jar on iOS) and that is expected.
- **Install and update:** `start_url` is `/explore`, scope `/`; after a DEV deploy the next launch runs the new build
  (a new worker, old cache dropped) with no stale screen; with the network off every screen fails plainly (no cached
  universe, by design); with it back, a retry works.
- **Touch and accessibility:** targets at least 44 px (`pointer: coarse` rules), portrait and landscape, no sideways
  scroll, VoiceOver / TalkBack read the sections, the Category control and the menu.

## 5. Routing

- A security finding (a cached private response, a session that survives revocation, a leak between accounts on one
  device) goes to issue #33.
- Verified rows and failed rows alike go to issue #34 (alpha readiness) as the installed-app line of its matrix; every
  **unverified** row above is a #34 task until a device has done it.
