import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { listAllUniverses } from './api'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { useFormSave } from '../lib/useFormSave'
import { useLocalDraft } from '../lib/useLocalDraft'
import { useSaveShortcut } from '../lib/useSaveShortcut'
import type { UniverseSummary } from '../universes/types'
import { recordActions } from './recordActions'
import {
  storedMomentOf,
  wordKey,
  type BaseFields,
  type Drafted,
  type RecordKind,
  type RecordLoad,
  type RecordState,
  type Shelved,
} from './recordKind'

/**
 * A record's editor, an idea's or a board's: the read (404 is missing, another universe is elsewhere), the recovery
 * copy, the whole save (409 changed elsewhere, 404 gone), create then `onCreated`, Save and Ctrl+S / Cmd+S alike, and
 * the handlers of `recordActions`. `record` is the kind's module-level `RecordKind`; `useDraft` is its
 * `useDraftedEditor` step. Catalogue: `docs/design/ui-components.md`.
 */
export function useRecordEditor<
  D extends Shelved,
  F extends BaseFields,
  S extends F & { updatedAt: string | null },
  I,
  X extends Drafted<F>,
>(
  record: RecordKind<D, F, S, I>,
  {
    id,
    defaultUniverseId,
    contextUniverse,
    useDraft,
    onCreated,
    onDeleted,
    afterRecover,
    resetView,
  }: {
    id: string | null
    defaultUniverseId: string | null
    contextUniverse: { id: string; name: string } | null
    useDraft: (state: RecordState<F, S>) => X
    onCreated: (record: D) => void
    onDeleted: (record: { id: string; title: string }) => void
    /** After the author answers the recovery copy, Recover or Discard. */
    afterRecover?: () => void
    /** When the record is read again, or loses the parts its universe held. */
    resetView?: () => void
  },
) {
  const isNew = id === null
  const { user } = useAuth()

  // An existing record's copy belongs to the account, not to a universe: the record outlives any universe it is in. A
  // new one's copy is kept per place it was started, so one started in a universe is never offered in another.
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user
      ? {
          accountId: user.id,
          universeId: isNew ? defaultUniverseId : null,
          kind: record.kind,
          contentId: id ?? 'new',
        }
      : null,
  )

  const [load, setLoad] = useState<RecordLoad>(
    isNew ? { kind: 'ready', value: null } : { kind: 'loading' },
  )
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<S>(() => record.blank(defaultUniverseId))
  const [draft, setDraft] = useState<F>(() => record.toFields(stored))
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [saves, setSaves] = useState(0)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  // A record changed elsewhere opens the conflict; a record gone says so; only a 400 names fields.
  const form = useFormSave({
    needChange: record.needChange,
    failed: () => t(wordKey(record.words, 'saveFailed')),
    badRequestOnly: true,
    refusal: (error) => {
      if (!(error instanceof ApiError)) return false
      if (error.status === 409 && error.code === record.changedCode) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
        return true
      }
      return error.status === 404 ? t(wordKey(record.words, 'saveGone')) : false
    },
  })
  const [announcement, setAnnouncement] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)
  const contextUniverseId = contextUniverse?.id ?? null

  useEffect(() => {
    if (id === null) return
    const controller = new AbortController()
    record
      .read(id, controller.signal)
      .then((read) => {
        // Inside a universe only that universe's records open. An address naming one of the account's records that
        // belongs to another universe, or to none, shows nothing of it here and points to where it does open. One moved
        // out while it is open here stays on screen, saying so - that was the author's own save, not an address.
        if (contextUniverseId !== null && read.universe?.id !== contextUniverseId) {
          setLoad({ kind: 'elsewhere' })
          return
        }
        const next = record.toStored(read)
        setStored(next)
        setDraft(record.toFields(next))
        setLoad({ kind: 'ready', value: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: t(wordKey(record.words, 'openFailed')) },
        )
      })
    return () => controller.abort()
  }, [record, id, reads, contextUniverseId])

  useEffect(() => {
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        // Without the list, the field still shows the record's own universe and "No universe"; choosing another waits.
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => controller.abort()
  }, [])

  const drafting = useDraft({
    isNew,
    load,
    draft,
    stored,
    titleInput,
    found,
    keep,
    forget,
    discard,
  })
  const { isDirty, isHeld } = drafting

  function edit(change: Partial<F>) {
    setDraft((current) => ({ ...current, ...change }))
    record.clearErrors(change, form.fieldErrors, form.setFieldErrors)
  }

  async function save(expectedUpdatedAt: string | null) {
    if (form.isSaving || !isDirty || drafting.isTooLong || isHeld) return
    if (draft.title.trim() === '') {
      form.setFieldErrors({ title: t(wordKey(record.words, 'titleRequired')) })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    await form.save(async () => {
      setConflict(null)
      if (id === null) {
        const created = await record.create(record.toInput(sent, null, stored))
        discard()
        onCreated(created)
        return
      }
      const saved = await record.update(id, record.toInput(sent, expectedUpdatedAt, stored))
      const next = record.toStored(saved)
      setStored(next)
      // What was sent is now saved, as the API keeps it. Anything changed while the save was in flight is still
      // unsaved, and stays.
      setDraft((current) => (record.same(current, sent) ? record.toFields(next) : current))
      setSaves((total) => total + 1)
    })
  }

  useSaveShortcut(() => void save(stored.updatedAt))

  const actions = recordActions({
    ...drafting,
    record,
    id,
    draft,
    stored,
    universes,
    edit,
    setDraft,
    setConflict,
    setFailure: form.setMessage,
    setFieldErrors: form.setFieldErrors,
    setLoad,
    setReads,
    setAnnouncement,
    discard,
    settle,
    onDeleted,
    afterRecover,
    resetView,
  })

  return {
    ...drafting,
    ...actions,
    isNew,
    user,
    found,
    keep,
    forget,
    discard,
    settle,
    failed,
    load,
    setLoad,
    reads,
    setReads,
    stored,
    setStored,
    draft,
    setDraft,
    universes,
    setUniverses,
    isSaving: form.isSaving,
    saves,
    failure: form.message,
    setFailure: form.setMessage,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    conflict,
    setConflict,
    announcement,
    setAnnouncement,
    titleInput,
    contextUniverseId,
    edit,
    save,
  }
}
