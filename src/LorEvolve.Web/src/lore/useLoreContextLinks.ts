import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { listEntities } from './api'
import { listLoreReferences, SCENE_CHANGED, updateScene } from '../stories/api'
import type { SceneLoreReference } from '../stories/types'
import { useUniverseAccess } from '../universes/access'
import type { RefObject } from 'react'
import type { LoreContextProps } from '../components/LoreContext'
import type { LoreRow } from '../components/lore/LoreContextRow'

const MAX_RESULTS = 8

/** Lore Context's data: the search and its answer, the mentioned entries read once, and a link or unlink saved. */
export function useLoreContextLinks({
  universeId,
  storyId,
  scene,
  mentions,
  onSceneSaved,
  onSceneChanged,
  dialog,
  linkedHeading,
}: Pick<
  LoreContextProps,
  'universeId' | 'storyId' | 'scene' | 'mentions' | 'onSceneSaved' | 'onSceneChanged'
> & {
  dialog: RefObject<HTMLDialogElement | null>
  linkedHeading: RefObject<HTMLHeadingElement | null>
}) {
  const { t } = useI18n()
  const access = useUniverseAccess()
  // One save at a time, held in a ref so a double press cannot send a second save over the same version.
  const inFlight = useRef(false)
  const [query, setQuery] = useState('')
  // Each answer is held with the words it answered, so a cleared or newer search never shows an older one's rows.
  const [answer, setAnswer] = useState<{
    term: string
    rows: LoreRow[] | null
    failed: boolean
  } | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // The entries the mentions name, read once when the drawer opens, by id: their names now, or gone.
  const mentioned = [...new Map(mentions.map((mention) => [mention.entityId, mention])).values()]
  const [mentionIds] = useState(() => mentioned.map((mention) => mention.entityId))
  const [references, setReferences] = useState<Map<string, SceneLoreReference> | 'failed' | null>(
    null,
  )

  useEffect(() => {
    if (mentionIds.length === 0) return
    const controller = new AbortController()
    listLoreReferences(universeId, mentionIds.slice(0, 100), controller.signal)
      .then((found) =>
        setReferences(new Map(found.map((reference) => [reference.entityId, reference]))),
      )
      .catch(() => {
        if (!controller.signal.aborted) setReferences('failed')
      })
    return () => controller.abort()
  }, [universeId, mentionIds])

  const term = query.trim()
  useEffect(() => {
    if (term === '') return

    const controller = new AbortController()
    // The scene form's picker search: the same route and the same index (ADR 0016), settled before it asks.
    const timer = setTimeout(() => {
      setSearching(true)
      listEntities(
        universeId,
        {
          search: term,
          entityTypeId: null,
          canonStatus: null,
          tag: null,
          page: 1,
          pageSize: MAX_RESULTS,
        },
        controller.signal,
      )
        .then((page) =>
          setAnswer({
            term,
            failed: false,
            rows: page.items.map((item) => ({
              id: item.id,
              name: item.name,
              typeName: item.entityTypeName,
              typeIcon: item.entityTypeIcon,
              typeAccent: item.entityTypeAccentColor,
              image: item.image,
              isTrashed: false,
            })),
          }),
        )
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ term, rows: null, failed: true })
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, term])

  const current = term !== '' && answer?.term === term ? answer : null
  const results = current?.rows ?? null
  const searchFailed = current?.failed ?? false
  const isSearching = term !== '' && searching

  const linked: LoreRow[] = scene.entities.map((reference) => ({
    id: reference.entityId,
    name: reference.name,
    typeName: reference.entityTypeName,
    typeIcon: reference.entityTypeIcon,
    typeAccent: reference.entityTypeAccentColor,
    image: reference.isTrashed ? null : reference.image,
    isTrashed: reference.isTrashed,
  }))
  const linkedIds = new Set(linked.map((row) => row.id))

  /** Keeps the focus in the drawer when the row that held it is gone, as an unlinked row is. */
  function holdFocus() {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (
        !dialog.current ||
        (active && active !== dialog.current && dialog.current.contains(active))
      )
        return
      linkedHeading.current?.focus()
    })
  }

  async function setLink(row: { id: string; name: string }, link: boolean) {
    if (inFlight.current || !access.editContent) return

    const current = scene.entities.map((reference) => reference.entityId)
    const entityIds = link
      ? current.includes(row.id)
        ? current
        : [...current, row.id]
      : current.filter((id) => id !== row.id)

    inFlight.current = true
    setBusy(row.id)
    setMessage(null)
    try {
      const saved = await updateScene(universeId, storyId, scene.id, {
        // Everything else exactly as stored, so the save changes the links and nothing more.
        title: scene.title,
        summary: scene.summary,
        notes: scene.notes,
        povEntityId: scene.pov?.entityId ?? null,
        chronology: scene.chronology,
        chapterId: scene.chapterId,
        entityIds,
        expectedVersion: scene.version,
      })
      onSceneSaved(saved)
      setAnnouncement(
        link
          ? t('lore.context.linked', { name: row.name })
          : t('lore.context.unlinked', { name: row.name }),
      )
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SCENE_CHANGED)) {
        setMessage(t('lore.context.changedElsewhere'))
        onSceneChanged()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage(t('lore.context.sceneGone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage(error.fieldErrors.entityIds ?? error.message)
      } else {
        setMessage(t('lore.context.notSaved'))
      }
    } finally {
      inFlight.current = false
      setBusy(null)
      holdFocus()
    }
  }

  return {
    query,
    setQuery,
    term,
    results,
    searchFailed,
    isSearching,
    busy,
    message,
    announcement,
    mentioned,
    references,
    linked,
    linkedIds,
    setLink,
  }
}
