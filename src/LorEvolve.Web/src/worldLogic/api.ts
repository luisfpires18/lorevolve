import { apiFetch } from '../lib/api'
import type {
  SystemDetail,
  SystemSummary,
  WorldLogicFindingDetail,
  WorldLogicFindingRow,
  WorldLogicPage,
  WorldLogicRuleRow,
  WorldLogicSweepResult,
} from './types'

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

function findings(universeId: string) {
  return `${base(universeId)}/world-logic/findings`
}

/**
 * What checking this universe's rules found, newest first, which is the order a list of records reads in.
 *
 * The order is the server's, asked for by name: sorting a page here would reorder that page rather than the list, so
 * paging and ordering have to be decided in the same place. The route's own default is attention order, which is
 * what it answered before this page asked, so nothing else that reads it changed.
 */
export function listWorldLogicFindings(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    sort: 'newest',
    page: String(page),
    pageSize: String(WORLD_LOGIC_PAGE_SIZE),
  })

  return apiFetch<WorldLogicPage<WorldLogicFindingRow>>(
    `${findings(universeId)}?${params.toString()}`,
    { signal },
  )
}

/** One finding with the evidence it rested on, the evaluator's trace and what the author has done about it. */
export function getWorldLogicFinding(universeId: string, findingId: string, signal?: AbortSignal) {
  return apiFetch<WorldLogicFindingDetail>(`${findings(universeId)}/${findingId}`, { signal })
}

/**
 * One of the author's three decisions about a finding. `review` is also the way back from a dismissal: it is the only
 * transition out of `dismissed`, and it says the author is looking at the problem again rather than suppressing it.
 */
export function decideWorldLogicFinding(
  universeId: string,
  findingId: string,
  decision: 'review' | 'dismiss' | 'resolve',
) {
  return apiFetch<WorldLogicFindingDetail>(`${findings(universeId)}/${findingId}/${decision}`, {
    method: 'POST',
    // No note: the page offers no field for one, and the API never reads a note for meaning.
    body: JSON.stringify({}),
  })
}

/** Checks every rule of the universe and records what it found. The answer is the counts, not the findings. */
export function evaluateWorldLogicFindings(universeId: string) {
  return apiFetch<WorldLogicSweepResult>(`${findings(universeId)}/evaluate`, { method: 'POST' })
}
