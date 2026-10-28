import { apiFetch } from '../lib/api'
import {
  TrashKind,
  type TrashBulkErased,
  type TrashErasedStory,
  type TrashItem,
  type TrashPage,
} from './types'

/** The same page size the lore browser uses, so the two screens read at the same rhythm. */
export const TRASH_PAGE_SIZE = 12

/** The code on the 409 a restore gets when what the row belongs to - its story, or a beat's arc - is in the Trash too. */
export const TRASH_PARENT_IN_TRASH = 'trash_parent_in_trash'

/** The code on the 409 a bulk delete gets when a selected row is no longer in the Trash as it was: nothing was deleted. */
export const TRASH_SELECTION_CHANGED = 'trash_selection_changed'

function base(universeId: string) {
  return `/api/universes/${universeId}/trash`
}

export function listTrash(universeId: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(TRASH_PAGE_SIZE) })
  return apiFetch<TrashPage>(`${base(universeId)}?${params.toString()}`, { signal })
}

/** Each kind's own route, so what is restored or erased is never a guess at what an id is. */
const ROUTES: Record<Exclude<TrashItem['kind'], typeof TrashKind.Entry>, string> = {
  [TrashKind.Story]: 'stories',
  [TrashKind.Chapter]: 'chapters',
  [TrashKind.Scene]: 'scenes',
  [TrashKind.PlotArc]: 'plot-arcs',
  [TrashKind.PlotBeat]: 'plot-beats',
  [TrashKind.WorldRule]: 'world-rules',
  [TrashKind.Relationship]: 'relationships',
  [TrashKind.TimelineEvent]: 'timeline',
}

/**
 * Brings one row back.
 *
 * An entry's restore is gated on the API like any other lore write, so it can fail with the Canon promotion gate's 409 -
 * read it with `blockingFindingsOf` - and a refused restore is atomic. Story content passes no gate; it can be refused
 * with `TRASH_PARENT_IN_TRASH` while its story, or a beat's arc, is in the Trash too. A world rule waits for nothing. A
 * relationship waits for its entries, and is refused as a duplicate if the same link was made again meanwhile; a timeline
 * moment is gated as an entry is.
 */
export function restoreFromTrash(universeId: string, item: TrashItem) {
  const path =
    item.kind === TrashKind.Entry
      ? `${base(universeId)}/${item.id}/restore`
      : `${base(universeId)}/${ROUTES[item.kind]}/${item.id}/restore`
  return apiFetch<unknown>(path, { method: 'POST' })
}

/**
 * Erases one row for good, on its kind's own route. Only something in the Trash can be: a live, missing or other world's id
 * is a 404, and nothing is written. What the row owns goes with it - a story's everything, an arc's beats - including owned
 * rows listed in the Trash on their own, so the list must be read again afterwards.
 *
 * Answers the ids of the scenes that went: a story's route says which (every scene it held); a scene's is its own; any
 * other kind erases none. Only ever read after the server has answered, so a failed delete names nothing.
 */
export async function deleteFromTrash(universeId: string, item: TrashItem): Promise<string[]> {
  const path =
    item.kind === TrashKind.Entry
      ? `${base(universeId)}/${item.id}`
      : `${base(universeId)}/${ROUTES[item.kind]}/${item.id}`

  if (item.kind === TrashKind.Story) {
    const erased = await apiFetch<TrashErasedStory>(path, { method: 'DELETE' })
    return erased.erasedSceneIds
  }

  await apiFetch<unknown>(path, { method: 'DELETE' })
  return item.kind === TrashKind.Scene ? [item.id] : []
}

/**
 * Erases a selection of rows for good, of any kinds, in one request: every one or none. Each row is named by its kind and id,
 * never guessed. A row that is no longer in the Trash as it was refuses all of it (409 `TRASH_SELECTION_CHANGED`).
 *
 * Answers how many selected rows went and the ids of every entry and scene that went - a selected story's scenes included -
 * read only after the server has answered, so a failed delete names nothing.
 */
export function bulkDeleteFromTrash(universeId: string, items: TrashItem[]) {
  return apiFetch<TrashBulkErased>(`${base(universeId)}/bulk-delete`, {
    method: 'POST',
    body: JSON.stringify({ items: items.map(({ kind, id }) => ({ kind, id })) }),
  })
}

/** Where a restored row lives, so the Trash can offer the way to it. */
export function restoredPath(universeId: string, item: TrashItem) {
  const universe = `/app/universes/${universeId}`
  const story = `${universe}/stories/${item.storyId ?? ''}`

  switch (item.kind) {
    case TrashKind.Entry:
      return `${universe}/lore/${item.id}`
    case TrashKind.Story:
      return story
    case TrashKind.Chapter:
      return `${story}#chapter-${item.id}`
    case TrashKind.Scene:
      return `${story}#scene-${item.id}`
    case TrashKind.PlotArc:
      return `${story}/plot#arc-${item.id}`
    case TrashKind.PlotBeat:
      return `${story}/plot#beat-${item.id}`
    case TrashKind.WorldRule:
      return `${universe}/world-rules/${item.id}`
    case TrashKind.Relationship:
      return item.entryId ? `${universe}/lore/${item.entryId}/relations` : `${universe}/lore`
    case TrashKind.TimelineEvent:
      return `${universe}/timeline`
  }
}
