import { apiFetch } from '../lib/api'
import type { ProjectStructureTree } from './structureTree'

export * from './structureTree'

export type ProjectNodeDetail = {
  id: string
  parentId: string | null
  level: string
  title: string | null
  summary: string | null
  body: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  version: number
}

export type ProjectNodeInput = {
  level: string
  parentId: string | null
  title?: string | null
  summary?: string | null
  body?: string | null
  place?: number | null
}

export type ProjectNodeUpdate = {
  title: string | null
  summary: string | null
  body: string | null
  expectedVersion: number | null
}

/** The code on the 409 a node save gets when it was saved somewhere else after it was opened here. */
export const NODE_CHANGED = 'project_node_changed'

const base = (projectId: string) => `/api/projects/${projectId}/structure`

export function getStructure(projectId: string, signal?: AbortSignal) {
  return apiFetch<ProjectStructureTree>(base(projectId), { signal })
}

export function getNode(projectId: string, nodeId: string, signal?: AbortSignal) {
  return apiFetch<ProjectNodeDetail>(`${base(projectId)}/${nodeId}`, { signal })
}

export function createNode(projectId: string, input: ProjectNodeInput) {
  return apiFetch<ProjectNodeDetail>(base(projectId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function saveNode(projectId: string, nodeId: string, input: ProjectNodeUpdate) {
  return apiFetch<ProjectNodeDetail>(`${base(projectId)}/${nodeId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteNode(projectId: string, nodeId: string) {
  return apiFetch<void>(`${base(projectId)}/${nodeId}`, { method: 'DELETE' })
}

export function moveNode(
  projectId: string,
  nodeId: string,
  input: { place: number; parentId: string | null },
) {
  return apiFetch<void>(`${base(projectId)}/${nodeId}/move`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
