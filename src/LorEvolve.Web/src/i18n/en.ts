import type { Shape } from './core'

/**
 * The source dictionary (ADR 0071): every message LorEvolve shows, in English, grouped by feature. Its keys are the
 * contract every other language's dictionary must match, so `npm run typecheck` names any key a translation lacks.
 *
 * A message is a string with optional `{name}` placeholders, or a plural `{ one, other }` (any form
 * `Intl.PluralRules` names) read with `tn`. Never call a group `other`: that key marks a plural.
 */
const en = {
  language: {
    label: 'Language',
  },
}

export type Dictionary = Shape<typeof en>

export default en
