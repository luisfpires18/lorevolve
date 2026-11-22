import { useCallback } from 'react'
import { t } from '../i18n'
import { isNotFound, useAsyncRead } from '../lib/useAsyncRead'
import { listStories } from '../stories/api'
import { getTimelineEntry, listTimelineItems } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useTimelineState } from './useTimelineState'
import { changed } from '../lib/queryParams'

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
  setForm,
  setMessage,
}: ReturnType<typeof useTimelineState> & { universe: WorkspaceContext['universe'] }) {
  // The story filter's choices. A universe holds a handful of stories, and the story list is unpaged for that reason;
  // a list that cannot be read offers none.
  const storyList = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => listStories(universe.id, signal).catch(() => []),
      [universe.id],
    ),
    { keep: true },
  )
  const stories = storyList.load.kind === 'ready' ? storyList.load.value : null

  /** Forgets `?moment=` in place, keeping every filter and the page. */
  const forgetMoment = useCallback(() => {
    setParams((current) => changed(current, { moment: null }, { keepPage: true }), {
      replace: true,
    })
  }, [setParams])

  // `?moment=<id>` opens that moment's editor wherever it sits in the chronology - the address a Canon finding or a rule's check
  // links to. The moment is read by id inside this universe, so an id from anywhere else simply is not here. What it
  // reads opens the editor or says why it cannot, so its own state is never drawn.
  useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
        linkedMoment
          ? getTimelineEntry(universe.id, linkedMoment, signal).then(
              (entry) => setForm({ mode: 'edit', entry }),
              (error: unknown) => {
                if (signal.aborted) return
                setMessage(
                  isNotFound(error)
                    ? t('time.timeline.momentGone')
                    : t('time.timeline.momentUnopened'),
                )
                forgetMoment()
              },
            )
          : undefined,
      [universe.id, linkedMoment, forgetMoment, setForm, setMessage],
    ),
  )

  // A new filter, search or page keeps the list shown until it lands; a read again after a save that fails says so.
  const items = useAsyncRead(
    useCallback(
      (signal: AbortSignal) =>
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
          signal,
        ),
      [universe.id, sourceParam?.source, storyId, canonStatus, participant, search, page],
    ),
    { keep: true, keepOnFailure: false, failed: t('time.timeline.readFailed') },
  )

  return { stories, items, forgetMoment, reload: items.refresh }
}
