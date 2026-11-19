import { useCallback, useEffect } from 'react'
import { t } from '../i18n'
import { listTrash } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useTrashState } from './useTrashState'
import { errorText } from '../lib/errorText'

/** Reads the Trash's page, again when asked, and moves the focus to what a restore did. */
export function useTrashReads({
  universe,
  page,
  setPage,
  setState,
  outcome,
  outcomeRef,
}: ReturnType<typeof useTrashState> & { universe: WorkspaceContext['universe'] }) {
  const load = useCallback(
    (signal?: AbortSignal) => {
      listTrash(universe.id, page, signal)
        .then((result) => {
          // A restore or a delete - which can take a story's or arc's own rows with it - can empty the page it was on:
          // step back to the last page there is rather than show an empty page that used to have something on it.
          if (result.items.length === 0 && result.page > 1) {
            setPage(Math.max(1, result.totalPages))
            return
          }
          setState({ kind: 'ready', value: result })
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setState({
            kind: 'error',
            message: errorText(error, t('data.trash.loadFailed')),
          })
        })
    },
    [universe.id, page],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  // The row that was restored leaves the list, taking the focus with it: the focus goes to what happened instead.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  return { load }
}
