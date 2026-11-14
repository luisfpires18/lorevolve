import { apiFetch } from '../lib/api'
import type { ProjectDetail, ProjectInput } from './types'

const BASE = '/api/projects'

/** The code on the 409 a save gets when the project was saved somewhere else after it was opened here. */
export const PROJECT_CHANGED = 'project_changed'

/**
 * The projects this account can reach, most recently updated first. One universe's with `universeId`, otherwise every
 * universe's. There is no filter for projects without a universe, because a project belongs to exactly one (#172).
 */
export function listProjects(filter: { universeId?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (filter.universeId) params.set('universeId', filter.universeId)

  const query = params.toString()
  return apiFetch<ProjectDetail[]>(query ? `${BASE}?${query}` : BASE, { signal })
}

export function getProject(id: string, signal?: AbortSignal) {
  return apiFetch<ProjectDetail>(`${BASE}/${id}`, { signal })
}

export function createProject(input: ProjectInput) {
  return apiFetch<ProjectDetail>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function saveProject(id: string, input: ProjectInput) {
  return apiFetch<ProjectDetail>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}
