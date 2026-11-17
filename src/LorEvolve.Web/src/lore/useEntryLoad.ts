import { useCallback, useEffect, useMemo } from 'react'
import { getEntityArticle } from './article'
import { isEmptyDocument } from './document'
import { getEntity } from './api'
import { CanonStatus } from './types'
import { copiedDraft, draftFromDetail, type Draft } from './entryDraft'
import type { EntityType } from './typeDefinitions'
import type { useEntryState } from './useEntryState'

/** Reads the entry and the entry it is copied from, and derives the draft the form shows. */
export function useEntryLoad({
  universe,
  entityId,
  reads,
  setDetail,
  setDraft,
  setStatus,
  setSent,
  sourceId,
  setSource,
  setSourceStatus,
  types,
  startingTypeId,
  sourceStatus,
  source,
  editedDraft,
  setHistoryKey,
}: ReturnType<typeof useEntryState> & {
  universe: { id: string }
  entityId: string | undefined
  sourceId: string | null
  types: EntityType[]
  startingTypeId: string | null
}) {
  const isNew = entityId === undefined

  /** An article save touched the entry: the rail's "last changed" says so without reading the entry again. */
  const articleSaved = useCallback((updatedAt: string) => {
    setDetail((current) => (current ? { ...current, updatedAt } : current))
  }, [])

  useEffect(() => {
    if (isNew) return

    const controller = new AbortController()
    getEntity(universe.id, entityId, controller.signal)
      .then((loaded) => {
        setDetail(loaded)
        setDraft(draftFromDetail(loaded))
        setStatus('ready')
        setSent(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus((error as { status?: number }).status === 404 ? 'missing' : 'error')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, isNew, reads])

  // The entry being copied, and its article, read once. One that cannot be read - gone to the Trash since, say - leaves an
  // ordinary blank form and a line saying so.
  useEffect(() => {
    if (sourceId === null) return

    const controller = new AbortController()
    Promise.all([
      getEntity(universe.id, sourceId, controller.signal),
      getEntityArticle(universe.id, sourceId, controller.signal),
    ])
      .then(([loaded, article]) => {
        setSource({ detail: loaded, article: isEmptyDocument(article.content) ? null : article })
        setSourceStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSourceStatus('unavailable')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, sourceId])

  // A new entry's blank draft is derived from the first available type rather than
  // written back into state, so nothing has to re-render to produce it. A copy's is the source's, as copied.
  const blankDraft = useMemo((): Draft | null => {
    if (!isNew || types.length === 0) return null
    if (sourceId !== null && sourceStatus === 'loading') return null
    if (source) return copiedDraft(source.detail, types)
    return {
      entityTypeId: types.find((type) => type.id === startingTypeId)?.id ?? types[0].id,
      name: '',
      summary: '',
      canonStatus: CanonStatus.Idea,
      aliases: [],
      tags: [],
      fields: {},
    } satisfies Draft
  }, [isNew, types, startingTypeId, sourceId, sourceStatus, source])
  const draft = editedDraft ?? blankDraft

  const selectedType = useMemo(
    () => types.find((type) => type.id === draft?.entityTypeId) ?? null,
    [types, draft?.entityTypeId],
  )

  /** After a restore the stored lore is a version the page has not seen. Read it back. */
  /**
   * Reads the entry again without touching the entry form: saving its eras changes when it was worked on and whether it has
   * eras, never what the form edits, and the form may hold unsaved work while another view is open.
   */
  async function refreshDetail() {
    if (entityId === undefined) return
    setDetail(await getEntity(universe.id, entityId))
  }

  async function reloadAfterRestore() {
    if (entityId === undefined) return

    const loaded = await getEntity(universe.id, entityId)
    setDetail(loaded)
    setDraft(draftFromDetail(loaded))
    setHistoryKey((key) => key + 1)
  }
  return { articleSaved, blankDraft, draft, selectedType, refreshDetail, reloadAfterRestore }
}
