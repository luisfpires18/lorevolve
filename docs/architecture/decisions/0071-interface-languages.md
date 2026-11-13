# ADR 0071 - Interface languages: typed dictionaries in the web app, chosen per browser

Status: accepted (2026-11-13). Issue #100, umbrella #99.

## Context

Every message the web app shows is written into its components in English. The owner wants a language choice, a flag
for English and a flag for Portuguese (Portugal), with any later language easy to add. The investigation on #99 counted
roughly 1,300 to 2,000 strings in about 130 files, 95 hand-written plurals, dates formatted in the browser's locale,
and 107 end-to-end specs that find elements by their English text.

## Decision

**A small typed module in `src/LorEvolve.Web/src/i18n/`, no dependency.**

- `en.ts` is the source dictionary, nested by feature. Its shape is the contract: `pt-PT.ts` uses `satisfies Dictionary`,
  so a missing or unknown key fails `npm run typecheck`. Never name a group `other`; that key marks a plural.
- `t(key, vars)` for a message with `{name}` placeholders, `tn(key, count)` for a plural chosen by `Intl.PluralRules`
  (Portuguese counts 0 as plural), `tx(key, nodes)` for a sentence holding a link or a bold name. Components read them
  through `useI18n()`, which re-renders when the language changes. A key a translation lacks falls back to English.
- English is in the bundle; every other dictionary is a chunk loaded on demand.
- **The choice lives in this browser**, like the theme (013): `localStorage['lorevolve-locale']`. Without one, the first
  browser language a ready translation covers (on its base, so `pt-BR` opens `pt-PT`), else English. Not an account
  setting: nothing server-side reads it yet.
- `main.tsx` awaits `startI18n()` before the first render, so a reader never sees English and then their language; for
  English that is one resolved promise. An inline bootstrap in `index.html` makes the same choice as `pickLocale` and
  sets `<html lang>` before the first paint; `startI18n` owns it afterwards.
- Dates and numbers go through `i18n/format.ts` (`dateFormat`, `numberFormat`, cached per locale). English keeps exactly
  what each call site used before (the browser's locale, or `'en'`), so nothing changes for English readers.
- `LanguageSwitch` sits beside `ThemeSwitch` (account menu, portal appearance menu, Profile), built from the same
  segmented control: an inline SVG flag (flag emoji do not render on Windows) and the language's own name.
- Each language in `locales.ts` has `ready`. Only ready languages are offered or picked from the browser. A saved choice
  of a known but unready language still applies, so a translation in progress can be previewed by setting the key; the
  switch then shows, so English is one press away. `pt-PT` stays unready until #107.

### Adding a language

1. `i18n/<code>.ts`: `const xx = { ... } satisfies Dictionary`; typecheck lists every missing key.
2. One entry in `LOCALES` (`i18n/locales.ts`): code, own name, flag, `ready`, `load`.
3. Its flag component in `i18n/flags.tsx`.
4. The same code and `ready` in the `known` list of the language bootstrap in `index.html`.

## Consequences

- Moving strings into `en.ts` must keep English output identical, so the English end-to-end specs stay valid.
- New UI text goes through `t()` from now on.
- A component that only formats a date (no `useI18n`) shows the new format on its next render, not at the moment of the
  switch. Almost every such component also has text, so it subscribes once its strings move.
- The segmented control fits two or three languages; it becomes a menu when there are more.

## Not covered here

API problem text (#108), emails, the assistant's language and starter types (#109), the readable export and canon
messages (#110), and public SEO with locale routes (#111) stay English until their issues. If the needs outgrow this
module (ICU messages, a translation platform, many languages), `react-i18next` can replace it behind the same `t()`
call sites.
