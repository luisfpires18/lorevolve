import { useEffect } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errorText'
import { getContentPublication } from '../publishing/api'
import { getStory } from './api'
import type { useUniverseAccess } from '../universes/access'
import type { useStoryState } from './useStoryState'

/** Reads the story's publication, then the story, again whenever `reloads` moves on. */
export function useStoryLoad({
  universe,
  storyId,
  access,
  setPublication,
  setState,
  setStale,
  reloads,
}: ReturnType<typeof useStoryState> & {
  universe: { id: string }
  storyId: string | undefined
  access: ReturnType<typeof useUniverseAccess>
}) {
  useEffect(() => {
    // Publication is the owner's (ADR 0041): nobody else is shown a pill, so nobody else asks.
    if (!storyId || !access.publish) return
    const controller = new AbortController()
    getContentPublication(universe.id, 'story', storyId, controller.signal)
      .then((state) => setPublication({ storyId, state }))
      .catch(() => {
        // The story's pill reads it again itself and says so if it cannot; the parts only never claim Public.
        if (!controller.signal.aborted) setPublication({ storyId, state: null })
      })
    return () => {
      controller.abort()
    }
  }, [universe.id, storyId, access.publish])

  useEffect(() => {
    if (!storyId) return
    const controller = new AbortController()

    getStory(universe.id, storyId, controller.signal)
      .then((story) => {
        setState({ kind: 'ready', value: story })
        setStale(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'missing' })
          return
        }

        // A story already on screen stays there, marked as possibly out of date, rather than being taken away - and
        // with it any prose being written beside it. Only a first read that fails has nothing to show.
        const message = errorText(error, t('stories.page.loadError'))
        setState((current) => (current.kind === 'ready' ? current : { kind: 'error', message }))
        setStale(true)
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, storyId, reloads])
}
