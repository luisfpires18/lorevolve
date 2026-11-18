import { useCallback, useEffect } from 'react'
import { getProgression } from '../progression/api'
import { listEntityRelationships, listRelationshipTypes } from './api'
import type { chronologyOf } from '../stories/sceneDraft'
import type { useI18n } from '../i18n'
import type { useRelationsState } from './useRelationsState'

export function useRelationsRead({
  universeId,
  entityId,
  at,
  t,
  draft,
  erasOf,
  setViews,
  setTypes,
  setReadError,
  setErasOf,
}: ReturnType<typeof useRelationsState> & {
  universeId: string
  entityId: string
  at: ReturnType<typeof chronologyOf> | null
  t: ReturnType<typeof useI18n>['t']
}) {
  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        listEntityRelationships(universeId, entityId, signal, at ? { at } : undefined),
        listRelationshipTypes(universeId, signal),
      ])
        .then(([loadedViews, loadedTypes]) => {
          setViews(loadedViews)
          setTypes(loadedTypes)
          setReadError(null)
        })
        .catch(() => {
          if (signal?.aborted) return
          // A failed read at a time keeps what was shown; a failed first read has nothing to keep.
          setViews((current) => current ?? [])
          setReadError(
            at ? t('relationships.section.readFailedAt') : t('relationships.section.readFailed'),
          )
        }),
    // `at` is rebuilt every render from what was shown; its text is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [universeId, entityId, JSON.stringify(at)],
  )

  // The eras of this entry and of the entry the relation connects to, read once each.
  const relatedId = draft?.related?.id ?? null
  useEffect(() => {
    if (!draft) return
    const controller = new AbortController()
    for (const id of [entityId, relatedId]) {
      if (!id || erasOf[id]?.status === 'loaded' || erasOf[id]?.status === 'loading') continue
      setErasOf((current) => ({ ...current, [id]: { status: 'loading', eras: [] } }))
      getProgression(universeId, id, controller.signal)
        .then((progression) =>
          setErasOf((current) => ({
            ...current,
            [id]: {
              status: 'loaded',
              eras: progression.eras.map((era) => ({ id: era.id, name: era.name })),
            },
          })),
        )
        .catch(() => {
          if (!controller.signal.aborted)
            setErasOf((current) => ({ ...current, [id]: { status: 'failed', eras: [] } }))
        })
    }
    return () => controller.abort()
    // Read again only for an entry not read yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId, entityId, relatedId, draft !== null])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  return { load, relatedId }
}
