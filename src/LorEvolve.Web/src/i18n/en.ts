import type { Shape } from './core'
import account from './en/account'
import auth from './en/auth'
import ideas from './en/ideas'
import review from './en/review'
import canon from './en/canon'
import data from './en/data'
import admin from './en/admin'
import apiErrors from './en/apiErrors'
import assistant from './en/assistant'
import entity from './en/entity'
import entityTypes from './en/entityTypes'
import lore from './en/lore'
import time from './en/time'
import progression from './en/progression'
import places from './en/places'
import manuscript from './en/manuscript'
import relationships from './en/relationships'
import workspace from './en/workspace'
import portal from './en/portal'
import publishing from './en/publishing'
import roles from './en/roles'
import shell from './en/shell'
import universe from './en/universe'
import stories from './en/stories'

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
  ideas,
  review,
  canon,
  data,
  admin,
  apiErrors,
  assistant,
  entity,
  entityTypes,
  lore,
  time,
  progression,
  places,
  manuscript,
  relationships,
  workspace,
  portal,
  publishing,
  roles,
  shell,
  universe,
  stories,
  language: {
    label: 'Language',
  },
}

export type Dictionary = Shape<typeof en>

export default en
