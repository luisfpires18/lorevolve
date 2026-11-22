import { useCallback, useEffect } from 'react'
import { listPublicLore, listPublicStories } from '../portal/api'
import { getPublication } from './api'
import { Visibility } from './types'
import type { useI18n } from '../i18n'
import type { usePublishState } from './usePublishState'
import { errorText } from '../lib/errorText'
import { useConfirmFocus } from '../lib/useConfirmFocus'

/** Reads the publication and, while public, what readers can see; moves the focus to a confirm or a refusal. */
export function usePublishReads({
  universeId,
  t,
  state,
  setState,
  setLoadError,
  confirming,
  problem,
  counted,
  setCounted,
  countRound,
  panel,
  problemRef,
}: ReturnType<typeof usePublishState> & {
  universeId: string
  t: ReturnType<typeof useI18n>['t']
}) {
  const load = useCallback(
    (signal?: AbortSignal) =>
      getPublication(universeId, signal)
        .then((next) => {
          setState(next)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setLoadError(errorText(error, t('universe.publish.loadFailed')))
        }),
    [universeId, t],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  const isPublic = state?.visibility === Visibility.Public
  const slug = state?.publicSlug ?? null

  // What readers can see inside it: the public listings' own totals, asked only while the universe is public.
  useEffect(() => {
    if (!isPublic || !slug) return
    const controller = new AbortController()
    Promise.all([
      listPublicLore(slug, 1, controller.signal),
      listPublicStories(slug, 1, controller.signal),
    ])
      .then(([lore, stories]) =>
        setCounted({ slug, lore: lore.totalCount, stories: stories.totalCount }),
      )
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [isPublic, slug, countRound])

  // Counts belong to the address they were read for, and only while the universe is public.
  const published = isPublic && counted?.slug === slug ? counted : null

  // The confirmation takes the focus when it opens, and a refusal does when it appears.
  useConfirmFocus(confirming, panel)

  useEffect(() => {
    if (problem) problemRef.current?.focus()
  }, [problem])

  return { load, isPublic, slug, published }
}
