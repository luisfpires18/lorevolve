import { listEntities } from './api'

/** The lore's entities whose name matches `words`, for a picker over the universe's own lore (not a project's entries). */
export async function searchLore(universeId: string, words: string, signal: AbortSignal) {
  const page = await listEntities(
    universeId,
    { page: 1, pageSize: 20, search: words, entityTypeId: null, canonStatus: null, tag: null },
    signal,
  )
  return page.items
}
