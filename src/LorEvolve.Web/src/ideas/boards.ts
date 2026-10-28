import { apiFetch } from '../lib/api'
import type { IdeaUniverse } from './types'

/**
 * Idea boards (ADR 0066): an account-owned canvas of notes, ideas and entries, saved whole. A board is a possibility laid
 * out, like an idea, and never lore - a line between two cards is not a relationship.
 */

const BASE = '/api/idea-boards'

export const BOARD_PAGE_SIZE = 20

/** The code on the 409 a save gets when the board was saved somewhere else after it was opened here. */
export const IDEA_BOARD_CHANGED = 'idea_board_changed'

/** Mirrors `IdeaBoardLimits`. */
export const BOARD_TITLE_MAX_LENGTH = 200
export const BOARD_NOTE_MAX_LENGTH = 2000
export const BOARD_LABEL_MAX_LENGTH = 80
export const BOARD_MAX_CARDS = 300
export const BOARD_MAX_CONNECTIONS = 600

/** Mirrors the backend enum: what a card holds. */
export const BoardCardKind = { Note: 0, Idea: 1, Entity: 2 } as const
export type BoardCardKindValue = (typeof BoardCardKind)[keyof typeof BoardCardKind]

export const BOARD_CARD_KIND_LABELS: Record<BoardCardKindValue, string> = {
  [BoardCardKind.Note]: 'Note',
  [BoardCardKind.Idea]: 'Idea',
  [BoardCardKind.Entity]: 'Lore',
}

/** One card as read: its place, its payload and - for an idea or an entry - what it points at, as it is now. */
export interface BoardCard {
  id: string
  kind: BoardCardKindValue
  x: number
  y: number
  width: number
  height: number
  text: string | null
  ideaId: string | null
  entityId: string | null
  name: string | null
  excerpt: string | null
  entityTypeName: string | null
  /** A deleted idea, or an entry in the Trash: shown as such, and kept by a save. */
  isGone: boolean
}

/** How a card reads in a sentence and in its own face: a note's first words, or what it points at. */
export function cardName(card: BoardCard) {
  if (card.kind === BoardCardKind.Note) {
    const text = (card.text ?? '').trim()
    return text === '' ? 'Empty note' : text.split('\n')[0]!.slice(0, 80)
  }
  return card.name ?? 'Untitled'
}

/** Top-left first, a row at a time: the order cards are read in, tabbed through and listed. */
export function readingOrder(cards: BoardCard[]) {
  return [...cards].sort((a, b) => a.y - b.y || a.x - b.x)
}

export interface BoardConnection {
  id: string
  fromCardId: string
  toCardId: string
  label: string | null
}

export interface IdeaBoardDetail {
  id: string
  title: string
  universe: IdeaUniverse | null
  cards: BoardCard[]
  connections: BoardConnection[]
  createdAt: string
  updatedAt: string
}

export interface IdeaBoardSummary {
  id: string
  title: string
  universe: IdeaUniverse | null
  cardCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface IdeaBoardPage {
  items: IdeaBoardSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** A save, whole: every card in draw order and every line. `expectedUpdatedAt` is ignored on create. */
export interface IdeaBoardInput {
  title: string
  universeId: string | null
  cards: Pick<
    BoardCard,
    'id' | 'kind' | 'x' | 'y' | 'width' | 'height' | 'text' | 'ideaId' | 'entityId'
  >[]
  connections: BoardConnection[]
  expectedUpdatedAt: string | null
}

export interface IdeaBoardQuery {
  universeId: string | null
  unassigned: boolean
  deleted: boolean
  search: string
  page: number
}

export function listIdeaBoards(query: IdeaBoardQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(BOARD_PAGE_SIZE),
  })
  if (query.universeId) params.set('universeId', query.universeId)
  if (query.unassigned) params.set('unassigned', 'true')
  if (query.deleted) params.set('deleted', 'true')
  if (query.search.trim()) params.set('search', query.search.trim())
  return apiFetch<IdeaBoardPage>(`${BASE}?${params.toString()}`, { signal })
}

export function getIdeaBoard(id: string, signal?: AbortSignal) {
  return apiFetch<IdeaBoardDetail>(`${BASE}/${id}`, { signal })
}

export function createIdeaBoard(input: IdeaBoardInput) {
  return apiFetch<IdeaBoardDetail>(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function saveIdeaBoard(id: string, input: IdeaBoardInput) {
  return apiFetch<IdeaBoardDetail>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteIdeaBoard(id: string) {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}

export function restoreIdeaBoard(id: string) {
  return apiFetch<IdeaBoardDetail>(`${BASE}/${id}/restore`, { method: 'POST' })
}
