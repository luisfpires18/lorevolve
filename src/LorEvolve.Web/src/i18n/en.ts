import type { Shape } from './core'
import account from './en/account'
import auth from './en/auth'
import portal from './en/portal'
import publishing from './en/publishing'
import shell from './en/shell'

/**
 * The source dictionary (ADR 0071): every message LorEvolve shows, in English, grouped by feature. Its keys are the
 * contract every other language's dictionary must match, so `npm run typecheck` names any key a translation lacks.
 *
 * A message is a string with optional `{name}` placeholders, or a plural `{ one, other }` (any form
 * `Intl.PluralRules` names) read with `tn`. An object whose keys are only plural forms
 * (`zero`, `one`, `two`, `few`, `many`, `other`) is a plural; any other key makes it a group. Each feature area keeps
 * its group in `en/<area>.ts`; every language mirrors that folder.
 */
const en = {
  account,
  auth,
  portal,
  publishing,
  shell,
  language: {
    label: 'Language',
  },
}

export type Dictionary = Shape<typeof en>

export default en
