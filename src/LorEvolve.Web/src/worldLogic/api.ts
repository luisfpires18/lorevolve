import { apiFetch } from '../lib/api'
import type {
  ConditionEvaluationResponse,
  SystemDetail,
  SystemInput,
  SystemMachineDetail,
  SystemMachineInput,
  SystemRuleDetail,
  SystemRuleInput,
  SystemRuleSummary,
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

/** A System is created in the whole universe; its scope is fixed at creation (ADR 0072). */
export function createSystem(universeId: string, input: SystemInput) {
  return apiFetch<SystemDetail>(`${base(universeId)}/systems`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Saves a System whole. `expectedVersion` is the version the edit was written over; a stale one is 409 `system_changed`. */
export function saveSystem(universeId: string, id: string, input: SystemInput) {
  return apiFetch<SystemDetail>(`${base(universeId)}/systems/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Deletes the System and its links, never a rule definition. There is no Trash for a System. */
export function deleteSystem(universeId: string, id: string) {
  return apiFetch<void>(`${base(universeId)}/systems/${id}`, { method: 'DELETE' })
}

/** A System's machine, whole. A System with none answers a null binding and empty lists. */
export function getSystemMachine(universeId: string, id: string, signal?: AbortSignal) {
  return apiFetch<SystemMachineDetail>(`${base(universeId)}/systems/${id}/machine`, { signal })
}

/**
 * Saves a System's machine whole. `expectedVersion` is the System's version, the same one a name save names, so a
 * stale one is 409 `system_changed`; a save that changes nothing leaves the version alone.
 */
export function saveSystemMachine(universeId: string, id: string, input: SystemMachineInput) {
  return apiFetch<SystemMachineDetail>(`${base(universeId)}/systems/${id}/machine`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** One page of the universe's rule definitions, the only rules a guard may name. The API allows up to 100. */
export function listSystemRules(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: '100' })

  return apiFetch<WorldLogicPage<SystemRuleSummary>>(
    `${base(universeId)}/system-rules?${params.toString()}`,
    { signal },
  )
}

/** One rule definition, whole: its condition, exceptions and declared dependencies as stored. */
export function getSystemRule(universeId: string, id: string, signal?: AbortSignal) {
  return apiFetch<SystemRuleDetail>(`${base(universeId)}/system-rules/${id}`, { signal })
}

/** Creates a rule definition. A condition the schema does not describe is 400 with its code and path. */
export function createSystemRule(universeId: string, input: SystemRuleInput) {
  return apiFetch<SystemRuleDetail>(`${base(universeId)}/system-rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Saves a rule definition whole. A stale `expectedVersion` is 409 `system_rule_changed`. */
export function saveSystemRule(universeId: string, id: string, input: SystemRuleInput) {
  return apiFetch<SystemRuleDetail>(`${base(universeId)}/system-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * Evaluates one rule now and stores nothing. `targetId` is what `self` stands for; without it a rule written with
 * `self` answers unknown.
 */
export function evaluateSystemRule(
  universeId: string,
  id: string,
  options: { targetId?: string; projectId?: string } = {},
) {
  const params = new URLSearchParams()
  if (options.targetId) params.set('targetId', options.targetId)
  if (options.projectId) params.set('projectId', options.projectId)
  const query = params.toString() ? `?${params.toString()}` : ''

  return apiFetch<ConditionEvaluationResponse>(
    `${base(universeId)}/system-rules/${id}/evaluate${query}`,
    { method: 'POST' },
  )
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
