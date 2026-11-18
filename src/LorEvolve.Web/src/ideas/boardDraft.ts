import {
  BoardCardKind,
  type BoardCard,
  type BoardConnection,
  type IdeaBoardDetail,
  type IdeaBoardInput,
} from './boards'
import type { IdeaUniverse } from './types'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'elsewhere' }
  | { kind: 'error'; message: string }

/** What an author edits, and exactly what a recovery copy holds. */
export interface Fields {
  title: string
  universeId: string | null
  cards: BoardCard[]
  connections: BoardConnection[]
}

/** The board as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
export interface Stored extends Fields {
  universe: IdeaUniverse | null
  updatedAt: string | null
}

export function inputOf(fields: Fields, expectedUpdatedAt: string | null): IdeaBoardInput {
  return {
    title: fields.title.trim(),
    universeId: fields.universeId,
    cards: fields.cards.map(({ id, kind, x, y, width, height, text, ideaId, entityId }) => ({
      id,
      kind,
      x,
      y,
      width,
      height,
      text: kind === BoardCardKind.Note ? (text ?? '') : null,
      ideaId: kind === BoardCardKind.Idea ? ideaId : null,
      entityId: kind === BoardCardKind.Entity ? entityId : null,
    })),
    connections: fields.connections.map(({ id, fromCardId, toCardId, label }) => ({
      id,
      fromCardId,
      toCardId,
      label: label?.trim() ? label.trim() : null,
    })),
    expectedUpdatedAt,
  }
}

export function sameFields(a: Fields, b: Fields) {
  return JSON.stringify(inputOf(a, null)) === JSON.stringify(inputOf(b, null))
}

export function storedFrom(board: IdeaBoardDetail): Stored {
  return {
    title: board.title,
    universeId: board.universe?.id ?? null,
    universe: board.universe,
    cards: board.cards,
    connections: board.connections,
    updatedAt: board.updatedAt,
  }
}

export function fieldsOf({ title, universeId, cards, connections }: Fields): Fields {
  return { title, universeId, cards, connections }
}

export function isBlank(fields: Fields) {
  return fields.title === '' && fields.cards.length === 0
}

/** A recovery copy read back, or null when it is not one this editor could have kept. */
export function parseCopy(content: string): Fields | null {
  try {
    const value = JSON.parse(content) as Partial<Fields> | null
    if (
      !value ||
      typeof value.title !== 'string' ||
      !(value.universeId === null || typeof value.universeId === 'string') ||
      !Array.isArray(value.cards) ||
      !Array.isArray(value.connections)
    ) {
      return null
    }
    return {
      title: value.title,
      universeId: value.universeId,
      cards: value.cards,
      connections: value.connections,
    }
  } catch {
    return null
  }
}

export function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

/** The fields without their lore cards and the lines that touched them: lore cards need the board's universe. */
export function withoutEntries(fields: Fields): Fields {
  const gone = new Set(
    fields.cards.filter((card) => card.kind === BoardCardKind.Entity).map((card) => card.id),
  )
  return {
    ...fields,
    cards: fields.cards.filter((card) => !gone.has(card.id)),
    connections: fields.connections.filter(
      (line) => !gone.has(line.fromCardId) && !gone.has(line.toCardId),
    ),
  }
}
