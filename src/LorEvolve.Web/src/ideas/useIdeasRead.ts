import { useEffect } from 'react'
import { listAllUniverses, listIdeas } from './api'
import type { useI18n } from '../i18n'
import type { useIdeasState } from './useIdeasState'

/** The value of the Show filter that means ideas in no universe. Never a universe id. */
export const UNASSIGNED = 'unassigned'

/** An ideas list's reads: the universes for the Show filter, and the page of ideas the address asks for. */
export function useIdeasRead({
  universe,
  setUniverses,
  show,
  storyId,
  projectId,
  view,
  search,
  page,
  reads,
  t,
  setState,
}: ReturnType<typeof useIdeasState> & {
  universe: { id: string; name: string } | null
  show: string
  storyId: string | null
  projectId: string | null
  view: 'deleted' | 'live'
  search: string
  page: number
  t: ReturnType<typeof useI18n>['t']
}) {
  useEffect(() => {
    if (universe) return
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => {
      controller.abort()
    }
  }, [universe])

  useEffect(() => {
    const controller = new AbortController()

    listIdeas(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        storyId,
        projectId,
        unassigned: show === UNASSIGNED,
        deleted: view === 'deleted',
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', value: result }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: t('ideas.browser.loadFailed') })
      })

    return () => {
      controller.abort()
    }
  }, [show, storyId, projectId, view, search, page, reads, t])
}
