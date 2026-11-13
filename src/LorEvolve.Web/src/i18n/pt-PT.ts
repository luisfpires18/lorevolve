import type { Dictionary } from './en'
import account from './pt-PT/account'
import auth from './pt-PT/auth'
import entity from './pt-PT/entity'
import entityTypes from './pt-PT/entityTypes'
import lore from './pt-PT/lore'
import time from './pt-PT/time'
import progression from './pt-PT/progression'
import places from './pt-PT/places'
import manuscript from './pt-PT/manuscript'
import relationships from './pt-PT/relationships'
import workspace from './pt-PT/workspace'
import portal from './pt-PT/portal'
import publishing from './pt-PT/publishing'
import roles from './pt-PT/roles'
import shell from './pt-PT/shell'

/**
 * European Portuguese (ADR 0071). Same keys as `en.ts`; `satisfies` fails the typecheck on a missing or unknown key.
 * Portugal's forms only: utilizador, ecrã, ficheiro, guardar, eliminar.
 */
const ptPT = {
  account,
  auth,
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
  language: {
    label: 'Idioma',
  },
} satisfies Dictionary

export default ptPT
