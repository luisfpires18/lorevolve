import { useEffect } from 'react'
import { listAllUniverses } from './api'
import { getIdeaBoard } from './boards'
import { fieldsOf, storedFrom } from './boardDraft'
import { ApiError } from '../lib/api'
import type { useI18n } from '../i18n'
import type { useBoardState } from './useBoardState'

/** A board editor's reads: the board itself, and the universes its Universe field offers. */
export function useBoardRead({
  boardId,
  reads,
  contextUniverseId,
  setLoad,
  setStored,
  setDraft,
  setUniverses,
  t,
}: ReturnType<typeof useBoardState> & {
  boardId: string | null
  t: ReturnType<typeof useI18n>['t']
}) {
  // Worked out from `boardId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = boardId === null
  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()
    getIdeaBoard(boardId, controller.signal)
      .then((board) => {
        if (contextUniverseId !== null && board.universe?.id !== contextUniverseId) {
          setLoad({ kind: 'elsewhere' })
          return
        }
        const next = storedFrom(board)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: t('ideas.board.openFailed') },
        )
      })
    return () => controller.abort()
  }, [isNew, boardId, reads, contextUniverseId, t])

  useEffect(() => {
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => controller.abort()
  }, [])
}
