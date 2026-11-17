import { useEffect, useState } from 'react'
import { listEntities } from './api'
import type { EntitySummary } from './types'

const MAX_RESULTS = 8

/**
 * Search-as-you-type over one universe, shared by both pickers. The API does the
 * searching, so nothing is preloaded and a large world costs the same as a small one.
 */
export function useEntitySearch(
  universeId: string,
  query: string,
  isOpen: boolean,
  excludeIds: string[],
  familyTreeOnly = false,
  entityTypeId: string | null = null,
  entityTypeGroupId: string | null = null,
) {
  const [results, setResults] = useState<EntitySummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [active, setActive] = useState(0)

  // Joined rather than held as an array, so a fresh array carrying the same ids on every
  // render does not restart the search.
  const excludeKey = excludeIds.join(',')

  useEffect(() => {
    if (!isOpen) return

    const excluded = new Set(excludeKey ? excludeKey.split(',') : [])
    const controller = new AbortController()

    // Typing settles before the API is asked, so a fast typist makes one call, not ten.
    const timer = setTimeout(() => {
      setIsSearching(true)
      listEntities(
        universeId,
        {
          search: query,
          // A picker chooses an entry by its name or alias, never one that only mentions the words.
          namesOnly: true,
          entityTypeId,
          // A link field limited to a type takes that type's nested types too (Issue #61).
          includeDescendants: true,
          entityTypeGroupId,
          canonStatus: null,
          tag: null,
          page: 1,
          familyTreeEligible: familyTreeOnly,
        },
        controller.signal,
      )
        .then((page) => {
          setResults(page.items.filter((item) => !excluded.has(item.id)).slice(0, MAX_RESULTS))
          setActive(0)
        })
        .catch(() => {
          /* An aborted or failed search simply leaves the previous results in place. */
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false)
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, query, excludeKey, isOpen, familyTreeOnly, entityTypeId, entityTypeGroupId])

  return { results, isSearching, active, setActive }
}
