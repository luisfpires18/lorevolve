import { apiFetch } from '../lib/api'
import type { ValidationTerm, ValidationTermKindValue } from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/validation-terms`
}

/** Every event kind and method of the universe, event kinds first, then by name. Not paged: a vocabulary is short. */
export function listValidationTerms(universeId: string, signal?: AbortSignal) {
  return apiFetch<ValidationTerm[]>(base(universeId), { signal })
}

export function createValidationTerm(
  universeId: string,
  kind: ValidationTermKindValue,
  name: string,
) {
  return apiFetch<ValidationTerm>(base(universeId), {
    method: 'POST',
    body: JSON.stringify({ kind, name }),
  })
}

/** A rename changes no match: rules and moments name the term by id. */
export function renameValidationTerm(universeId: string, id: string, name: string) {
  return apiFetch<ValidationTerm>(`${base(universeId)}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

/** Refused with 409 while a rule, in the Trash or not, or a moment names the term. */
export function deleteValidationTerm(universeId: string, id: string) {
  return apiFetch<void>(`${base(universeId)}/${id}`, { method: 'DELETE' })
}
