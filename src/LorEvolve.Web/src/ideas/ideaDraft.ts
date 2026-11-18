import type { IdeaDetail, IdeaReference, IdeaUniverse } from './types'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'elsewhere' }
  | { kind: 'error'; message: string }

/** What an author edits, and exactly what a recovery copy holds. */
export interface Fields {
  title: string
  body: string
  universeId: string | null
  references: IdeaReference[]
}

/** The idea as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
export interface Stored extends Fields {
  universe: IdeaUniverse | null
  updatedAt: string | null
  /** The project the idea is a note for (#197). Not edited here: kept on every save while the universe stays. */
  projectId: string | null
}

export function referenceKey(reference: { kind: number; id: string }) {
  return `${reference.kind}:${reference.id}`
}

export function sameFields(a: Fields, b: Fields) {
  if (a.title !== b.title || a.body !== b.body || a.universeId !== b.universeId) return false
  const left = a.references.map(referenceKey).sort()
  const right = b.references.map(referenceKey).sort()
  return left.length === right.length && left.every((key, index) => key === right[index])
}

export function storedFrom(idea: IdeaDetail): Stored {
  return {
    title: idea.title,
    body: idea.body,
    universeId: idea.universe?.id ?? null,
    universe: idea.universe,
    references: idea.references,
    updatedAt: idea.updatedAt,
    projectId: idea.project?.id ?? null,
  }
}

export function fieldsOf({ title, body, universeId, references }: Fields): Fields {
  return { title, body, universeId, references }
}

/** Nothing written yet: what a new idea is before a key is pressed, whatever universe it starts in. */
export function isBlank(fields: Fields) {
  return fields.title === '' && fields.body === '' && fields.references.length === 0
}

/** A recovery copy read back, or null when it is not one this editor could have kept. */
export function parseCopy(content: string): Fields | null {
  try {
    const value = JSON.parse(content) as Partial<Fields> | null
    if (
      !value ||
      typeof value.title !== 'string' ||
      typeof value.body !== 'string' ||
      !(value.universeId === null || typeof value.universeId === 'string') ||
      !Array.isArray(value.references)
    ) {
      return null
    }
    return {
      title: value.title,
      body: value.body,
      universeId: value.universeId,
      references: value.references,
    }
  } catch {
    return null
  }
}

/** The stored moment a stale save's refusal reports, when it carries one. */
export function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}
