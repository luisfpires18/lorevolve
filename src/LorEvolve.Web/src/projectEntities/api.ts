import { apiFetch } from '../lib/api'
import type {
  ProjectEntityDetail,
  ProjectEntityInput,
  ProjectEntitySummary,
  ProjectEntityType,
  ProjectFieldInput,
  ProjectTemplate,
  ProjectTypeInput,
} from './types'

/** A project's own schema and entries (#144). Reached through the project, which resolves to its universe's access. */
const base = (projectId: string) => `/api/projects/${projectId}`

export function listProjectTypes(projectId: string, signal?: AbortSignal) {
  return apiFetch<ProjectEntityType[]>(`${base(projectId)}/entity-types`, { signal })
}

export function getProjectTemplate(projectId: string, signal?: AbortSignal) {
  return apiFetch<ProjectTemplate>(`${base(projectId)}/template`, { signal })
}

/** Writes the starter types for this project's kind. Refused once the project has any type of its own. */
export function applyProjectTemplate(projectId: string) {
  return apiFetch<ProjectEntityType[]>(`${base(projectId)}/template`, { method: 'POST' })
}

export function createProjectType(projectId: string, input: ProjectTypeInput) {
  return apiFetch<ProjectEntityType>(`${base(projectId)}/entity-types`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveProjectType(projectId: string, typeId: string, input: ProjectTypeInput) {
  return apiFetch<ProjectEntityType>(`${base(projectId)}/entity-types/${typeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteProjectType(projectId: string, typeId: string) {
  return apiFetch<void>(`${base(projectId)}/entity-types/${typeId}`, { method: 'DELETE' })
}

export function addProjectField(projectId: string, typeId: string, input: ProjectFieldInput) {
  return apiFetch<ProjectEntityType>(`${base(projectId)}/entity-types/${typeId}/fields`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteProjectField(projectId: string, typeId: string, fieldId: string) {
  return apiFetch<void>(`${base(projectId)}/entity-types/${typeId}/fields/${fieldId}`, {
    method: 'DELETE',
  })
}

/** The entries of a project, or of one type; `page` reads a slice of them in the API's own order (#196). */
export function listProjectEntities(
  projectId: string,
  typeId?: string,
  signal?: AbortSignal,
  page?: { skip: number; take: number },
) {
  const params = new URLSearchParams()
  if (typeId) params.set('typeId', typeId)
  if (page) {
    params.set('skip', String(page.skip))
    params.set('take', String(page.take))
  }
  const query = params.toString() ? `?${params.toString()}` : ''
  return apiFetch<ProjectEntitySummary[]>(`${base(projectId)}/entities${query}`, { signal })
}

export function getProjectEntity(projectId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<ProjectEntityDetail>(`${base(projectId)}/entities/${entityId}`, { signal })
}

export function createProjectEntity(projectId: string, input: ProjectEntityInput) {
  return apiFetch<ProjectEntityDetail>(`${base(projectId)}/entities`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveProjectEntity(projectId: string, entityId: string, input: ProjectEntityInput) {
  return apiFetch<ProjectEntityDetail>(`${base(projectId)}/entities/${entityId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteProjectEntity(projectId: string, entityId: string) {
  return apiFetch<void>(`${base(projectId)}/entities/${entityId}`, { method: 'DELETE' })
}
