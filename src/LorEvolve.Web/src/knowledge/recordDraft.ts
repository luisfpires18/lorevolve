import type { EntityChoice } from '../components/EntityPicker'
import type { KnowledgeRecord } from './api'

/** Which way a record is read from this entry: what the entry knows, or who knows about the entry. */
export type Side = 'knows' | 'about'

export interface Draft {
  other: EntityChoice | null
  statement: string
  knownFromStart: boolean
  storyId: string
  sceneId: string
}

export function draftOf(record: KnowledgeRecord | null, side: Side): Draft {
  if (record === null) {
    return { other: null, statement: '', knownFromStart: false, storyId: '', sceneId: '' }
  }
  const other = side === 'knows' ? record.subject : record.knower
  return {
    other: other ? { id: other.id, name: other.name, typeName: other.typeName } : null,
    statement: record.statement,
    knownFromStart: record.knownFromStart,
    storyId: record.scene?.storyId ?? '',
    sceneId: record.scene?.sceneId ?? '',
  }
}

export const draftKey = (draft: Draft) =>
  JSON.stringify([
    draft.other?.id ?? null,
    draft.statement,
    draft.knownFromStart,
    draft.storyId,
    draft.sceneId,
  ])
