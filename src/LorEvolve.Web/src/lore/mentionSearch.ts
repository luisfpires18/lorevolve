import { useEffect, useState } from 'react'
import { listEntities } from './api'
import type { EntitySummary } from './types'
import { useDebouncedValue } from '../lib/useDebouncedValue'

/** How many entries the suggestions show at once. */
export const MENTION_SUGGESTIONS = 6

export interface MentionSearch {
  /** The query the rows answer; null while nothing has answered it yet. */
  query: string | null
  rows: EntitySummary[]
  failed: boolean
}

/**
 * The Lore the author can reach whose name, alias or words match `query`, from Lore's own search (the scene picker's,
 * ADR 0016). Asked only once the author has typed a character after `@`, and settled briefly first, so fast typing asks
 * once. An answer is held with the words it answered, so an older one never shows under newer words.
 */
export function useMentionSearch(universeId: string, query: string | null): MentionSearch {
  const [answer, setAnswer] = useState<MentionSearch>({ query: null, rows: [], failed: false })
  const term = query?.trim() ?? ''
  const settled = useDebouncedValue(term)

  useEffect(() => {
    if (settled === '') return
    const controller = new AbortController()
    listEntities(
      universeId,
      {
        search: settled,
        entityTypeId: null,
        canonStatus: null,
        tag: null,
        page: 1,
        pageSize: MENTION_SUGGESTIONS,
      },
      controller.signal,
    )
      .then((page) => setAnswer({ query: settled, rows: page.items, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ query: settled, rows: [], failed: true })
      })
    return () => {
      controller.abort()
    }
  }, [universeId, settled])

  return answer.query === term && term !== '' ? answer : { query: null, rows: [], failed: false }
}
