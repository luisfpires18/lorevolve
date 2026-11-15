import { apiFetch } from '../lib/api'
import type { ProjectDetail, ProjectInput } from './types'

const BASE = '/api/projects'

/** The code on the 409 a save gets when the project was saved somewhere else after it was opened here. */
export const PROJECT_CHANGED = 'project_changed'

/** The most rows one list request may ask for, the API's own `ProjectEndpoints.MaxPageSize` (#198). */
export const PROJECT_PAGE_SIZE = 100

/**
 * One page of the projects this account can reach, most recently updated first, stored projects and stories shown as
 * Writing Projects paged together. One universe's with `universeId`, otherwise every universe's. There is no filter for
 * projects without a universe, because a project belongs to exactly one (#172). `include` names the project the author
 * is in: when it is past the page it is added after it, so a short list never loses the one being read (#198).
 */
export function listProjects(
  filter: { universeId?: string; offset?: number; limit?: number; include?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (filter.universeId) params.set('universeId', filter.universeId)
  if (filter.offset) params.set('offset', String(filter.offset))
  if (filter.limit) params.set('limit', String(filter.limit))
  if (filter.include) params.set('include', filter.include)

  const query = params.toString()
  return apiFetch<ProjectDetail[]>(query ? `${BASE}?${query}` : BASE, { signal })
}

/** Every project, read a page at a time until a short page says there are no more. For the full list screen. */
export async function listAllProjects(filter: { universeId?: string } = {}, signal?: AbortSignal) {
  const all: ProjectDetail[] = []
  for (;;) {
    const page = await listProjects(
      { ...filter, offset: all.length, limit: PROJECT_PAGE_SIZE },
      signal,
    )
    all.push(...page)
    if (page.length < PROJECT_PAGE_SIZE) return all
  }
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
