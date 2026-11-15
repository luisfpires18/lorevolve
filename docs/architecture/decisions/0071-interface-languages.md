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
  so a missing or unknown key fails `npm run typecheck`. An object whose keys are only plural forms (`zero`, `one`,
  `two`, `few`, `many`, `other`) is a plural; a group may still hold a message called `other`. Each feature area keeps
  its group in `en/<area>.ts`; every language mirrors the folder, and an untranslated area re-exports the English file.
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
  switch then shows, so English is one press away. `pt-PT` became ready in #107, so the switch is live.

### Adding a language

1. `i18n/<code>.ts`: `const xx = { ... } satisfies Dictionary`; typecheck lists every missing key.
2. One entry in `LOCALES` (`i18n/locales.ts`): code, own name, flag, `ready`, `load`.
3. Its flag component in `i18n/flags.tsx`.
4. The same code and `ready` in the `known` list of the language bootstrap in `index.html`.

## Consequences

- Moving strings into `en.ts` must keep English output identical, so the English end-to-end specs stay valid.
- The end-to-end suite pins `locale: 'en-US'` (`playwright.config.ts`), because LorEvolve otherwise opens in the
  language the browser asks for and every English assertion would fail on a Portuguese machine. `language.spec.ts`
  asks for other languages itself.
- A visible switch adds two buttons to the account menu, which is a roving keyboard walk: a spec that counts its items
  counts these too.
- New UI text goes through `t()` from now on. `python scripts/find-hardcoded-text.py` is the check: it parses each
  `.tsx` and exits 1 on any prose left in a component. Three strings reached review past a grep before it existed.
- A component that only formats a date (no `useI18n`) shows the new format on its next render, not at the moment of the
  switch. Almost every such component also has text, so it subscribes once its strings move.
- The segmented control fits two or three languages; it becomes a menu when there are more.

## The API's own text (#109)

The web app sends `Accept-Language` with the reader's chosen language, not the browser's list, and
`Features/Localization/RequestLanguage.cs` reads it: the first tag LorEvolve has words for, matched on its base so
`pt`, `pt-BR` and `pt-PT` all mean European Portuguese, else English.

There is no resource file and no `IStringLocalizer`. The API writes text in a handful of places, so each holds its own
words beside the English, the way the web app's dictionary does:

- The two emails take a `language` and switch subject, HTML, plain text and `<html lang>`. English is the default and
  is unchanged to the byte, so an English reader gets exactly what they got before.
- A new universe's starter types and groups are seeded in the creating request's language, once. What a universe holds
  afterwards is its author's: nothing translates an existing universe, and reading it in another language shows the
  names that were written.
- The assistant is told which language to answer in, and told not to translate a recorded name, title or quotation.

Two things that must stay English, and do: `EntityTypeDefaults.IsUntouchedStarterCharacter`, which recognises a starter
type in a backup from before version 18 and so can only ever meet the English words; and the dates in `SignUpEmail`,
where the host runs with `InvariantGlobalization`, so a `pt-PT` `CultureInfo` would print English month names and the
Portuguese month is written out instead.

## Not covered here

API problem text (#108), the readable export and canon messages (#110), and public SEO with locale routes (#111) stay
English until their issues. If the needs outgrow this module (ICU messages, a translation platform, many languages),
`react-i18next` can replace it behind the same `t()` call sites.
