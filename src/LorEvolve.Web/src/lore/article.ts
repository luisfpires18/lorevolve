import { apiFetch } from '../lib/api'
import type { RevisionKindValue } from './revisions'

/**
 * How long one article's document may be, in characters of the editor's JSON as JavaScript counts them. Mirrors
 * `LoreLimits.ContentMaxLength` on the API, which refuses anything longer; the editor says so before a save.
 */
export const ARTICLE_MAX_LENGTH = 200_000

/** The code on the 409 an article save or restore gets when the article was saved somewhere else after it was opened. */
export const ARTICLE_CHANGED = 'entity_article_changed'

/**
 * An entry's article, read on its own route and never part of the entry, a listing or a search result. `content` is the
 * editor's document, or '' for an entry with no article; `updatedAt` is null until the first save. `version` is what the
 * next save names: 0 until the first save, then advanced by every save that changes the article (ADR 0043).
 */
export interface EntityArticle {
  entityId: string
  content: string
  updatedAt: string | null
  version: number
}

/** One save: the whole document, and the `version` it was written over. */
export interface EntityArticleInput {
  content: string
  expectedVersion: number
}

/** A row in the article's own history. No text; `isEmpty` says the save cleared the article. */
export interface ArticleRevisionSummary {
  id: string
  number: number
  kind: RevisionKindValue
  restoredFromRevisionId: string | null
  createdAt: string
  isEmpty: boolean

  /** The username of the account that saved this version; null when none was recorded. */
  actorName: string | null
}

export interface ArticleRevisionDetail {
  id: string
  number: number
  kind: RevisionKindValue
  restoredFromRevisionId: string | null
  createdAt: string
  content: string
}

function article(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/article`
}

/** The article of one entry. Read when that entry is opened - never with a listing. */
export function getEntityArticle(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<EntityArticle>(article(universeId, entityId), { signal })
}

/** Replaces the article with exactly `input.content`, if `input.expectedVersion` is still the latest save. */
export function saveEntityArticle(universeId: string, entityId: string, input: EntityArticleInput) {
  return apiFetch<EntityArticle>(article(universeId, entityId), {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function listArticleRevisions(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<ArticleRevisionSummary[]>(`${article(universeId, entityId)}/revisions`, {
    signal,
  })
}

export function getArticleRevision(universeId: string, entityId: string, revisionId: string) {
  return apiFetch<ArticleRevisionDetail>(`${article(universeId, entityId)}/revisions/${revisionId}`)
}

/** Puts a saved version back as the article, refused like a stale save if the article moved on since it was read. */
export function restoreArticleRevision(
  universeId: string,
  entityId: string,
  revisionId: string,
  expectedVersion: number,
) {
  return apiFetch<EntityArticle>(
    `${article(universeId, entityId)}/revisions/${revisionId}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    },
  )
}
