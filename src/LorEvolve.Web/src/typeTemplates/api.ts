import { apiFetch } from '../lib/api'
import type { ProjectFieldInput, ProjectTypeInput } from '../projectEntities/types'
import type { TypeTemplate } from './types'

/** A universe's type templates (#281). Reading is open to the universe's readers, writing needs Edit content. */
const base = (universeId: string) => `/api/universes/${universeId}/type-templates`

export function listTypeTemplates(universeId: string, signal?: AbortSignal) {
  return apiFetch<TypeTemplate[]>(`${base(universeId)}`, { signal })
}

/** A template has no parent: the request's parentId is always null. */
export function createTypeTemplate(universeId: string, input: ProjectTypeInput) {
  return apiFetch<TypeTemplate>(`${base(universeId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveTypeTemplate(universeId: string, id: string, input: ProjectTypeInput) {
  return apiFetch<TypeTemplate>(`${base(universeId)}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTypeTemplate(universeId: string, id: string) {
  return apiFetch<void>(`${base(universeId)}/${id}`, { method: 'DELETE' })
}

export function addTemplateField(universeId: string, id: string, input: ProjectFieldInput) {
  return apiFetch<TypeTemplate>(`${base(universeId)}/${id}/fields`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveTemplateField(
  universeId: string,
  id: string,
  fieldId: string,
  input: ProjectFieldInput,
) {
  return apiFetch<TypeTemplate>(`${base(universeId)}/${id}/fields/${fieldId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTemplateField(universeId: string, id: string, fieldId: string) {
  return apiFetch<void>(`${base(universeId)}/${id}/fields/${fieldId}`, { method: 'DELETE' })
}
