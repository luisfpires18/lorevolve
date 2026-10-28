import { apiFetch } from '../lib/api'

/** What a review thread is about: a Lore entry, a story, or one scene of a story. */
export type CommentSubject =
  | { kind: 'entry'; entityId: string }
  | { kind: 'story'; storyId: string }
  | { kind: 'scene'; storyId: string; sceneId: string }

export interface ReviewComment {
  id: string
  /** The author's username; null when the account can no longer be found. */
  authorName: string | null
  body: string
  createdAt: string
}

export interface CommentThread {
  id: string
  isResolved: boolean
  resolvedByName: string | null
  resolvedAt: string | null
  /** The first comment started the thread; the rest are replies, oldest first. */
  comments: ReviewComment[]
}

/** The longest comment the API keeps, after trimming. */
export const COMMENT_MAX_LENGTH = 4000

/** Where a subject's threads are read and started. Also what tells one subject from another. */
export function commentsPath(universeId: string, subject: CommentSubject) {
  const universe = `/api/universes/${universeId}`
  switch (subject.kind) {
    case 'entry':
      return `${universe}/entities/${subject.entityId}/comments`
    case 'story':
      return `${universe}/stories/${subject.storyId}/comments`
    case 'scene':
      return `${universe}/stories/${subject.storyId}/scenes/${subject.sceneId}/comments`
  }
}

const thread = (universeId: string, threadId: string) =>
  `/api/universes/${universeId}/comment-threads/${threadId}`

/** Every thread at `path` (from `commentsPath`), newest first, open and resolved alike. */
export function listComments(path: string, signal?: AbortSignal) {
  return apiFetch<CommentThread[]>(path, { signal })
}

export function startThread(path: string, body: string) {
  return apiFetch<CommentThread>(path, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function replyToThread(universeId: string, threadId: string, body: string) {
  return apiFetch<CommentThread>(`${thread(universeId, threadId)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function setThreadResolved(universeId: string, threadId: string, resolved: boolean) {
  return apiFetch<CommentThread>(
    `${thread(universeId, threadId)}/${resolved ? 'resolve' : 'reopen'}`,
    {
      method: 'POST',
    },
  )
}
