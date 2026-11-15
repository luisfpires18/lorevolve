import { apiFetch } from '../lib/api'

/** A project's seasons and the episodes in them (#145). */
export type ProjectEpisodeSummary = {
  id: string
  seasonId: string
  title: string
  synopsis: string | null
  /** The list says only that there is a script, and how long it is: a season of television is a lot of text. */
  hasScript: boolean
  scriptLength: number
  sortOrder: number
  createdAt: string
  updatedAt: string
  version: number
}

export type ProjectEpisodeDetail = {
  id: string
  seasonId: string
  title: string
  synopsis: string | null
  script: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  version: number
}

export type ProjectSeason = {
  id: string
  name: string
  summary: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  episodes: ProjectEpisodeSummary[]
}

export type ProjectSeasonInput = {
  name: string
  summary: string | null
}

export type ProjectEpisodeInput = {
  title: string
  synopsis: string | null
  script: string | null
  expectedVersion: number | null
}

/** Where something goes: a place among its siblings, and the season it moves to when it changes season. */
export type ProjectMoveInput = {
  place: number
  seasonId?: string | null
}

/** The code on the 409 an episode save gets when it was saved somewhere else after it was opened here. */
export const EPISODE_CHANGED = 'project_episode_changed'

const base = (projectId: string) => `/api/projects/${projectId}/seasons`

export function listSeasons(projectId: string, signal?: AbortSignal) {
  return apiFetch<ProjectSeason[]>(base(projectId), { signal })
}

export function createSeason(projectId: string, input: ProjectSeasonInput) {
  return apiFetch<ProjectSeason>(base(projectId), { method: 'POST', body: JSON.stringify(input) })
}

export function saveSeason(projectId: string, seasonId: string, input: ProjectSeasonInput) {
  return apiFetch<ProjectSeason>(`${base(projectId)}/${seasonId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteSeason(projectId: string, seasonId: string) {
  return apiFetch<void>(`${base(projectId)}/${seasonId}`, { method: 'DELETE' })
}

export function moveSeason(projectId: string, seasonId: string, input: ProjectMoveInput) {
  return apiFetch<void>(`${base(projectId)}/${seasonId}/move`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createEpisode(projectId: string, seasonId: string, input: ProjectEpisodeInput) {
  return apiFetch<ProjectEpisodeDetail>(`${base(projectId)}/${seasonId}/episodes`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getEpisode(
  projectId: string,
  seasonId: string,
  episodeId: string,
  signal?: AbortSignal,
) {
  return apiFetch<ProjectEpisodeDetail>(`${base(projectId)}/${seasonId}/episodes/${episodeId}`, {
    signal,
  })
}

export function saveEpisode(
  projectId: string,
  seasonId: string,
  episodeId: string,
  input: ProjectEpisodeInput,
) {
  return apiFetch<ProjectEpisodeDetail>(`${base(projectId)}/${seasonId}/episodes/${episodeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteEpisode(projectId: string, seasonId: string, episodeId: string) {
  return apiFetch<void>(`${base(projectId)}/${seasonId}/episodes/${episodeId}`, {
    method: 'DELETE',
  })
}

export function moveEpisode(
  projectId: string,
  seasonId: string,
  episodeId: string,
  input: ProjectMoveInput,
) {
  return apiFetch<void>(`${base(projectId)}/${seasonId}/episodes/${episodeId}/move`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
