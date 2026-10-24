import { apiFetch } from '../lib/api'

/** The longest statement the API keeps, after trimming. */
export const KNOWLEDGE_STATEMENT_MAX_LENGTH = 1000

/** An entry as a knowledge record names it, read live from the entry. */
export interface KnowledgeLoreRef {
  id: string
  name: string
  typeName: string
  isTrashed: boolean
}

/** The scene a record is anchored to, placed in its story's reading order. */
export interface KnowledgeSceneRef {
  sceneId: string
  title: string
  storyId: string
  storyTitle: string
  chapterId: string | null
  /** 1-based among the story's live chapters; null for Unchaptered. */
  chapterNumber: number | null
  chapterTitle: string | null
  /** 1-based among the live scenes of its container. */
  position: number
  isTrashed: boolean
}

/** What a list can say about a record without inferring anything. */
export type KnowledgeIssue =
  'knower_not_in_scene' | 'scene_trashed' | 'knower_trashed' | 'subject_trashed'

export interface KnowledgeRecord {
  id: string
  knower: KnowledgeLoreRef
  subject: KnowledgeLoreRef | null
  statement: string
  knownFromStart: boolean
  scene: KnowledgeSceneRef | null
  issues: KnowledgeIssue[]
  createdAt: string
  updatedAt: string
}

export interface KnowledgeRecordInput {
  knowerEntityId: string
  subjectEntityId: string | null
  statement: string
  sceneId: string | null
  knownFromStart: boolean
}

export interface KnowledgeQuery {
  knowerId?: string
  subjectId?: string
  sceneId?: string
  storyId?: string
}

const base = (universeId: string) => `/api/universes/${universeId}/knowledge`

/** The universe's records, or those about one knower, subject, scene or story, in reading order. */
export function listKnowledge(
  universeId: string,
  query: KnowledgeQuery = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return apiFetch<KnowledgeRecord[]>(`${base(universeId)}${search ? `?${search}` : ''}`, {
    signal,
  })
}

export function createKnowledgeRecord(universeId: string, input: KnowledgeRecordInput) {
  return apiFetch<KnowledgeRecord>(base(universeId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateKnowledgeRecord(
  universeId: string,
  recordId: string,
  input: KnowledgeRecordInput,
) {
  return apiFetch<KnowledgeRecord>(`${base(universeId)}/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteKnowledgeRecord(universeId: string, recordId: string) {
  return apiFetch<void>(`${base(universeId)}/${recordId}`, { method: 'DELETE' })
}

/** Where a record was learnt, in a reader's words: "The Causeway · Chapter 2: Arrival, scene 1 of The Drowned Heir". */
export function describeScene(scene: KnowledgeSceneRef) {
  const container =
    scene.chapterNumber === null
      ? `scene ${scene.position}`
      : `Chapter ${scene.chapterNumber}, scene ${scene.position}`
  return `${container} of ${scene.storyTitle}`
}
