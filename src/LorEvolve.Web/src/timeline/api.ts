import { apiFetch } from '../lib/api'
import type {
  TimelineEntry,
  TimelineEntryInput,
  TimelineItemPage,
  TimelineItemQuery,
} from './types'

/** Moments are tall, so a page holds fewer of them than the lore grid does. */
export const TIMELINE_PAGE_SIZE = 12

function base(universeId: string) {
  return `/api/universes/${universeId}/timeline`
}

/**
 * One page of the unified timeline: moments, dated scenes and birth and death years, in one world order, filtered and
 * counted together by the API. Nothing here pages one source and then another.
 */
export function listTimelineItems(
  universeId: string,
  query: TimelineItemQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(TIMELINE_PAGE_SIZE),
  })

  if (query.source !== null) params.set('source', String(query.source))
  if (query.storyId) params.set('storyId', query.storyId)
  if (query.canonStatus !== null) params.set('canonStatus', String(query.canonStatus))
  if (query.entityId) params.set('entityId', query.entityId)
  if (query.search.trim()) params.set('search', query.search.trim())

  return apiFetch<TimelineItemPage>(`${base(universeId)}/items?${params}`, { signal })
}

export function getTimelineEntry(universeId: string, entryId: string, signal?: AbortSignal) {
  return apiFetch<TimelineEntry>(`${base(universeId)}/${entryId}`, { signal })
}

export function createTimelineEntry(universeId: string, input: TimelineEntryInput) {
  return apiFetch<TimelineEntry>(base(universeId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTimelineEntry(
  universeId: string,
  entryId: string,
  input: TimelineEntryInput,
) {
  return apiFetch<TimelineEntry>(`${base(universeId)}/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTimelineEntry(universeId: string, entryId: string) {
  return apiFetch<void>(`${base(universeId)}/${entryId}`, { method: 'DELETE' })
}
