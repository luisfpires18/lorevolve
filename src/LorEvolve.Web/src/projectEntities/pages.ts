import { apiFetch } from '../lib/api'

/** A comic chapter's pages and the panels on them (#147). */
export type ProjectPanel = {
  id: string
  pageId: string
  description: string | null
  dialogue: string | null
  canonEntityId: string | null
  /** The named lore entry's name, resolved by the API: the link is not a foreign key. */
  canonEntityName: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ProjectPage = {
  id: string
  episodeId: string
  name: string | null
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  panels: ProjectPanel[]
}

export type ProjectPageInput = {
  name: string | null
  notes: string | null
}

export type ProjectPanelInput = {
  description: string | null
  dialogue: string | null
  canonEntityId: string | null
}

export type ProjectPanelMoveInput = {
  place: number
  pageId?: string | null
}

const base = (projectId: string, volumeId: string, chapterId: string) =>
  `/api/projects/${projectId}/seasons/${volumeId}/episodes/${chapterId}/pages`

export function listPages(
  projectId: string,
  volumeId: string,
  chapterId: string,
  signal?: AbortSignal,
) {
  return apiFetch<ProjectPage[]>(base(projectId, volumeId, chapterId), { signal })
}

export function createPage(
  projectId: string,
  volumeId: string,
  chapterId: string,
  input: ProjectPageInput,
) {
  return apiFetch<ProjectPage>(base(projectId, volumeId, chapterId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deletePage(projectId: string, volumeId: string, chapterId: string, pageId: string) {
  return apiFetch<void>(`${base(projectId, volumeId, chapterId)}/${pageId}`, { method: 'DELETE' })
}

export function movePage(
  projectId: string,
  volumeId: string,
  chapterId: string,
  pageId: string,
  place: number,
) {
  return apiFetch<void>(`${base(projectId, volumeId, chapterId)}/${pageId}/move`, {
    method: 'POST',
    body: JSON.stringify({ place }),
  })
}

export function createPanel(
  projectId: string,
  volumeId: string,
  chapterId: string,
  pageId: string,
  input: ProjectPanelInput,
) {
  return apiFetch<ProjectPanel>(`${base(projectId, volumeId, chapterId)}/${pageId}/panels`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function savePanel(
  projectId: string,
  volumeId: string,
  chapterId: string,
  pageId: string,
  panelId: string,
  input: ProjectPanelInput,
) {
  return apiFetch<ProjectPanel>(
    `${base(projectId, volumeId, chapterId)}/${pageId}/panels/${panelId}`,
    { method: 'PUT', body: JSON.stringify(input) },
  )
}

export function deletePanel(
  projectId: string,
  volumeId: string,
  chapterId: string,
  pageId: string,
  panelId: string,
) {
  return apiFetch<void>(`${base(projectId, volumeId, chapterId)}/${pageId}/panels/${panelId}`, {
    method: 'DELETE',
  })
}

export function movePanel(
  projectId: string,
  volumeId: string,
  chapterId: string,
  pageId: string,
  panelId: string,
  input: ProjectPanelMoveInput,
) {
  return apiFetch<void>(
    `${base(projectId, volumeId, chapterId)}/${pageId}/panels/${panelId}/move`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}
