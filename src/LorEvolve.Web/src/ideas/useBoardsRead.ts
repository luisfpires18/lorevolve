import { useEffect } from 'react'
import { listAllUniverses } from './api'
import { listIdeaBoards } from './boards'
import type { useI18n } from '../i18n'
import type { useBoardsState } from './useBoardsState'

export const UNASSIGNED = 'unassigned'

/** The boards list's reads: the universes for the Show filter, and the page of boards the address asks for. */
export function useBoardsRead({
  universe,
  setUniverses,
  show,
  deleted,
  search,
  page,
  reads,
  t,
  setState,
}: ReturnType<typeof useBoardsState> & {
  universe: { id: string; name: string } | null
  show: string
  deleted: boolean
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
    return () => controller.abort()
  }, [universe])

  useEffect(() => {
    const controller = new AbortController()
    listIdeaBoards(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        unassigned: show === UNASSIGNED,
        deleted,
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', value: result }))
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ kind: 'error', message: t('ideas.boards.loadFailed') })
      })
    return () => controller.abort()
  }, [show, deleted, search, page, reads, t])
}
