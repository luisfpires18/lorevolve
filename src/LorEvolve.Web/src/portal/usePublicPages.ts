import { useCallback, useEffect, useRef, useState } from 'react'

interface Page<T> {
  items: T[]
  page: number
  totalCount: number
  totalPages: number
}

type Loaded<T> = {
  key: string
  kind: 'ready'
  items: T[]
  page: number
  totalCount: number
  totalPages: number
}

/**
 * A public listing read a page at a time, the way Explore reads worlds: the first page for `key`, then "show more"
 * appends the next one, keeping anything already shown from appearing twice (a publish in between shifts pages by one).
 * No infinite scroll. `key` names what is being listed; a new key starts again from page 1, and null waits.
 */
export function usePublicPages<T extends { slug: string }>(
  key: string | null,
  fetchPage: (page: number, signal: AbortSignal) => Promise<Page<T>>,
) {
  const [attempt, setAttempt] = useState(0)
  const fetchKey = key === null ? null : `${key}#${attempt}`
  const [loaded, setLoaded] = useState<Loaded<T> | { key: string; kind: 'error' } | null>(null)
  const [more, setMore] = useState<'idle' | 'loading' | 'error'>('idle')
  const fetcher = useRef(fetchPage)
  const moreRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    fetcher.current = fetchPage
  })

  useEffect(() => {
    if (fetchKey === null) return
    const controller = new AbortController()
    moreRequest.current?.abort()
    fetcher
      .current(1, controller.signal)
      .then((page) => {
        setMore('idle')
        setLoaded({ key: fetchKey, kind: 'ready', ...page })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key: fetchKey, kind: 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [fetchKey])

  const current = loaded?.key === fetchKey ? loaded : null
  const ready = current?.kind === 'ready' ? current : null

  const showMore = useCallback(() => {
    if (!ready || fetchKey === null) return
    const controller = new AbortController()
    moreRequest.current = controller
    setMore('loading')
    fetcher
      .current(ready.page + 1, controller.signal)
      .then((page) => {
        setMore('idle')
        setLoaded((was) => {
          if (was?.key !== fetchKey || was.kind !== 'ready') return was
          const seen = new Set(was.items.map((item) => item.slug))
          return {
            ...was,
            items: [...was.items, ...page.items.filter((item) => !seen.has(item.slug))],
            page: page.page,
            totalCount: page.totalCount,
            totalPages: page.totalPages,
          }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setMore('error')
      })
  }, [ready, fetchKey])

  return {
    status: current === null ? ('loading' as const) : current.kind,
    items: ready?.items ?? [],
    totalCount: ready?.totalCount ?? 0,
    hasMore: ready !== null && ready.page < ready.totalPages,
    more,
    showMore,
    retry: () => setAttempt((value) => value + 1),
  }
}
