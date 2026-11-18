import { useEffect } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { getSceneManuscript } from './api'
import { storedOf, type useManuscriptState } from './useManuscriptState'

/** Reads the scene's manuscript, again whenever `reads` moves on. */
export function useManuscriptLoad({
  universeId,
  storyId,
  sceneId,
  setLoad,
  reads,
  setStored,
  setDraft,
}: ReturnType<typeof useManuscriptState> & { universeId: string; storyId: string }) {
  useEffect(() => {
    const controller = new AbortController()

    getSceneManuscript(universeId, storyId, sceneId, controller.signal)
      .then((manuscript) => {
        setStored(storedOf(manuscript))
        setDraft(manuscript.content)
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: t('manuscript.editor.openFailed') },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, storyId, sceneId, reads])
}
