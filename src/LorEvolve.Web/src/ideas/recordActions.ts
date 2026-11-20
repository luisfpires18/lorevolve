import { createElement, type Dispatch, type SetStateAction } from 'react'
import { t, tn, tx } from '../i18n'
import type { PluralKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import type { UniverseSummary } from '../universes/types'
import {
  wordKey,
  type BaseFields,
  type FieldErrors,
  type RecordKind,
  type RecordLoad,
  type Shelved,
} from './recordKind'

/** `useRecordEditor`'s handlers for the whole record: reading again, the recovery copy, the universe and delete. */
export function recordActions<D extends Shelved, F extends BaseFields, S extends F, I>({
  record,
  id,
  draft,
  stored,
  universes,
  isDirty,
  offer,
  copy,
  edit,
  setDraft,
  setConflict,
  setFailure,
  setFieldErrors,
  setLoad,
  setReads,
  setAnnouncement,
  discard,
  settle,
  onDeleted,
  afterRecover,
  resetView,
}: {
  record: RecordKind<D, F, S, I>
  id: string | null
  draft: F
  stored: S
  universes: UniverseSummary[] | null
  isDirty: boolean
  offer: unknown
  copy: F | null
  edit: (change: Partial<F>) => void
  setDraft: Dispatch<SetStateAction<F>>
  setConflict: (conflict: null) => void
  setFailure: (message: string | null) => void
  setFieldErrors: (fieldErrors: FieldErrors) => void
  setLoad: (load: RecordLoad) => void
  setReads: Dispatch<SetStateAction<number>>
  setAnnouncement: (text: string) => void
  discard: () => void
  settle: () => void
  onDeleted: (record: { id: string; title: string }) => void
  afterRecover?: () => void
  resetView?: () => void
}) {
  const w = record.words
  const key = (name: string) => wordKey(w, name)

  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    resetView?.()
    setLoad({ kind: 'loading' })
    setReads((total) => total + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: t(key('loadSaved.title')),
        message: t(key('loadSaved.message')),
        confirmLabel: t(key('loadSaved.confirm')),
        cancelLabel: t(key('loadSaved.cancel')),
        variant: 'destructive',
      }))
    ) {
      return
    }
    discard()
    reread()
  }

  function recoverDraft() {
    if (!offer || !copy) return
    settle()
    // A copy may name a universe that has since been deleted: the record is kept, unassigned, and so is the copy.
    const universeGone =
      copy.universeId !== null &&
      universes !== null &&
      !universes.some((universe) => universe.id === copy.universeId)
    setDraft(universeGone ? record.dependentsOf({ ...copy, universeId: null }).without : copy)
    setAnnouncement(universeGone ? t(key('recoveredUnassigned')) : t(key('recovered')))
    afterRecover?.()
  }

  function discardDraft() {
    discard()
    setAnnouncement(record.discarded(id === null))
    afterRecover?.()
  }

  async function changeUniverse(next: string | null) {
    if (next === draft.universeId) return
    const { count } = record.dependentsOf(draft)
    if (count > 0) {
      const confirmed = await confirmAction({
        title: t(key('changeUniverse.title')),
        message: tn(`${w}.changeUniverse.message` as PluralKey<Dictionary>, count, { n: count }),
        confirmLabel: t(key('changeUniverse.confirm')),
        variant: 'warning',
      })
      if (!confirmed) return
      setDraft((current) => ({ ...record.dependentsOf(current).without, universeId: next }))
      resetView?.()
      setAnnouncement(t(key('universeChanged')))
      return
    }
    edit({ universeId: next } as Partial<F>)
  }

  async function remove() {
    if (id === null) return
    const title = stored.title
    setFailure(null)
    const deleted = await confirmAction({
      title: tx(key('delete.title'), { title: createElement('bdi', null, title) }),
      message: isDirty ? t(key('delete.messageDirty')) : t(key('delete.message')),
      confirmLabel: t(key('delete.confirm')),
      busyLabel: t(key('delete.busy')),
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? t(key('delete.gone'))
          : t(key('delete.failed')),
      action: () => record.delete(id),
    })
    if (!deleted) return
    discard()
    onDeleted({ id, title })
  }

  return { reread, loadSavedVersion, recoverDraft, discardDraft, changeUniverse, remove }
}
