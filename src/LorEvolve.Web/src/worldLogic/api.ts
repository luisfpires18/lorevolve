import { apiFetch } from '../lib/api'
import type { SystemDetail, SystemSummary, WorldLogicPage, WorldLogicRuleRow } from './types'

/** One page of a universe's World Logic. The API allows up to 100. */
export const WORLD_LOGIC_PAGE_SIZE = 50

function base(universeId: string) {
  return `/api/universes/${universeId}`
}

/**
 * Every rule the universe has, of both kinds, by title (ADR 0072). Read-only: a world rule is still saved through its
 * own routes, and a rule definition through its own.
 */
export function listWorldLogicRules(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(WORLD_LOGIC_PAGE_SIZE),
  })

  return apiFetch<WorldLogicPage<WorldLogicRuleRow>>(
    `${base(universeId)}/world-logic/rules?${params.toString()}`,
    { signal },
  )
}

/** The universe's Systems, by name. */
export function listSystems(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(WORLD_LOGIC_PAGE_SIZE),
  })

  return apiFetch<WorldLogicPage<SystemSummary>>(
    `${base(universeId)}/systems?${params.toString()}`,
    { signal },
  )
}

/** One System, with the rule definitions it references in its own order. */
export function getSystem(universeId: string, id: string, signal?: AbortSignal) {
  return apiFetch<SystemDetail>(`${base(universeId)}/systems/${id}`, { signal })
}
