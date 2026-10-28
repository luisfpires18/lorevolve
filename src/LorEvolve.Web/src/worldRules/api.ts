import { apiFetch } from '../lib/api'
import type { WorldRuleDetail, WorldRuleInput, WorldRulePage } from './types'

/** One page of a rule book is most rule books; the API allows up to 100. */
export const WORLD_RULE_PAGE_SIZE = 50

/** The code on the 409 a save gets when the rule was saved somewhere else after it was opened here. */
export const WORLD_RULE_CHANGED = 'world_rule_changed'

function base(universeId: string) {
  return `/api/universes/${universeId}/world-rules`
}

/** The universe's live rules, by title. Rules in the Trash are listed by the Trash, not here. */
export function listWorldRules(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(WORLD_RULE_PAGE_SIZE) })
  return apiFetch<WorldRulePage>(`${base(universeId)}?${params.toString()}`, { signal })
}

export function getWorldRule(universeId: string, id: string, signal?: AbortSignal) {
  return apiFetch<WorldRuleDetail>(`${base(universeId)}/${id}`, { signal })
}

export function createWorldRule(universeId: string, input: WorldRuleInput) {
  return apiFetch<WorldRuleDetail>(base(universeId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveWorldRule(universeId: string, id: string, input: WorldRuleInput) {
  return apiFetch<WorldRuleDetail>(`${base(universeId)}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Into the universe's Trash, whole. The Trash's own restore route brings it back. */
export function deleteWorldRule(universeId: string, id: string) {
  return apiFetch<void>(`${base(universeId)}/${id}`, { method: 'DELETE' })
}
