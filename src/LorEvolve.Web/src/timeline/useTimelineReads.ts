import { useCallback, useEffect } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { listStories } from '../stories/api'
import { getTimelineEntry, listTimelineItems } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useTimelineState } from './useTimelineState'

/** The Timeline screen's reads: the story list, a moment named by `?moment=`, and the page of items. */
export function useTimelineReads({
  universe,
  setParams,
  linkedMoment,
  storyId,
  sourceParam,
  canonStatus,
  search,
  page,
  participant,
  setStories,
  setState,
  setForm,
  setMessage,
  reloads,
  setReloads,
}: ReturnType<typeof useTimelineState> & { universe: WorkspaceContext['universe'] }) {
  // The story filter's choices. A universe holds a handful of stories, and the story list is unpaged for that reason.
  useEffect(() => {
    const controller = new AbortController()
    listStories(universe.id, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setStories([])
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  /** Forgets `?moment=` in place, keeping every filter and the page. */
  const forgetMoment = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('moment')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  // `?moment=<id>` opens that moment's editor wherever it sits in the chronology - the address a Canon finding or a rule's check
  // links to. The moment is read by id inside this universe, so an id from anywhere else simply is not here.
  useEffect(() => {
    if (!linkedMoment) return
    const controller = new AbortController()

    getTimelineEntry(universe.id, linkedMoment, controller.signal)
      .then((entry) => setForm({ mode: 'edit', entry }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(
          error instanceof ApiError && error.status === 404
            ? t('time.timeline.momentGone')
            : t('time.timeline.momentUnopened'),
        )
        forgetMoment()
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, linkedMoment, forgetMoment])

  useEffect(() => {
    const controller = new AbortController()

    listTimelineItems(
      universe.id,
      {
        source: sourceParam?.source ?? null,
        storyId,
        canonStatus,
        entityId: participant?.id ?? null,
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('time.timeline.readFailed'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, sourceParam?.source, storyId, canonStatus, participant, search, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  return { forgetMoment, reload }
}
