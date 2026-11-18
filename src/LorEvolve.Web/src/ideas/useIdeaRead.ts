import { useEffect } from 'react'
import { getIdea, listAllUniverses } from './api'
import { fieldsOf, storedFrom } from './ideaDraft'
import { ApiError } from '../lib/api'
import type { useI18n } from '../i18n'
import type { useIdeaState } from './useIdeaState'

/** An idea editor's reads: the idea itself, and the universes its Universe field offers. */
export function useIdeaRead({
  ideaId,
  reads,
  contextUniverseId,
  setLoad,
  setStored,
  setDraft,
  setUniverses,
  t,
}: ReturnType<typeof useIdeaState> & {
  ideaId: string | null
  t: ReturnType<typeof useI18n>['t']
}) {
  // Worked out from `ideaId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = ideaId === null
  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()

    getIdea(ideaId, controller.signal)
      .then((idea) => {
        // Inside a universe only that universe's ideas open. An address naming one of the account's ideas that belongs to
        // another universe, or to none, shows nothing of it here and points to where it does open. An idea moved out while
        // it is open here stays on screen, saying so - that was the author's own save, not an address.
        if (contextUniverseId !== null && idea.universe?.id !== contextUniverseId) {
          setLoad({ kind: 'elsewhere' })
          return
        }
        const next = storedFrom(idea)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: t('ideas.editor.openFailed') },
        )
      })

    return () => {
      controller.abort()
    }
  }, [isNew, ideaId, reads, contextUniverseId, t])

  useEffect(() => {
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        // Without the list, the field still shows the idea's own universe and "No universe"; choosing another waits.
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => {
      controller.abort()
    }
  }, [])
}
