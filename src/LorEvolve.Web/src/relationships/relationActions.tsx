import { periodInputs } from './periods'
import { createRelationship, deleteRelationship, updateRelationship } from './api'
import type { RelationshipView } from './types'
import { CanonStatus } from '../lore/types'
import { confirmAction } from '../lib/confirm'
import type { useI18n } from '../i18n'
import { draftFromView, draftKey, type RelationDraft } from './relationDraft'
import type { useRelationsState } from './useRelationsState'

export function relationActions({
  universeId,
  entityId,
  confirmLeave,
  reckonsInEras,
  custom,
  load,
  t,
  tx,
  types,
  editingId,
  draft,
  setIsAdding,
  setEditingId,
  setDraft,
  setFieldErrors,
  setMessage,
  form,
  setOpened,
}: ReturnType<typeof useRelationsState> & {
  universeId: string
  entityId: string
  /** The section's discard guard: true when there is nothing to lose or the author lets it go. */
  confirmLeave: () => Promise<boolean>
  reckonsInEras: boolean
  custom: boolean
  load: () => Promise<void>
  t: ReturnType<typeof useI18n>['t']
  tx: ReturnType<typeof useI18n>['tx']
}) {
  function close() {
    setIsAdding(false)
    setEditingId(null)
    setDraft(null)
    setFieldErrors({})
  }

  /** Cancel, or opening another relation over this one: asks once, only when there is something to lose. */
  const mayDiscard = confirmLeave

  function begin(next: RelationDraft) {
    setDraft(next)
    setOpened(draftKey(next))
  }

  async function openAdd() {
    if (types.length === 0 || !(await mayDiscard())) return
    setMessage(null)
    setFieldErrors({})
    setEditingId(null)
    setIsAdding(true)
    begin({
      typeId: types[0].id,
      useInverse: false,
      related: null,
      canonStatus: CanonStatus.Idea,
      legacyStart: null,
      legacyEnd: null,
      notes: '',
      periods: [],
    })
  }

  async function openEdit(view: RelationshipView) {
    if (!(await mayDiscard())) return
    setMessage(null)
    setFieldErrors({})
    setIsAdding(false)
    setEditingId(view.id)
    begin(draftFromView(view))
  }

  async function save() {
    if (!draft) return

    if (!draft.related) {
      setFieldErrors({ targetentityid: t('relationships.section.chooseEntry') })
      return
    }

    // The stored row always runs source to target. Which end this entry sits on comes
    // from the wording the author picked, so no source/target vocabulary reaches them.
    const input = {
      relationshipTypeId: draft.typeId,
      sourceEntityId: draft.useInverse ? draft.related.id : entityId,
      targetEntityId: draft.useInverse ? entityId : draft.related.id,
      canonStatus: draft.canonStatus,
      startDate: draft.legacyStart,
      endDate: draft.legacyEnd,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
      periods: periodInputs(draft.periods, reckonsInEras, custom),
    }

    await form.save(async () => {
      if (editingId) {
        await updateRelationship(universeId, editingId, input)
      } else {
        await createRelationship(universeId, input)
      }
      close()
      await load()
    })
  }

  async function remove(view: RelationshipView) {
    setMessage(null)
    const removed = await confirmAction({
      title: (
        <>
          {tx('relationships.section.moveTitle', {
            label: <bdi>{view.label}</bdi>,
            related: <bdi>{view.relatedEntityName}</bdi>,
          })}
        </>
      ),
      message: t('relationships.section.moveMessage'),
      confirmLabel: t('relationships.section.moveConfirm'),
      busyLabel: t('relationships.section.moveBusy'),
      variant: 'warning',
      failure: t('relationships.section.removeFailed'),
      action: () => deleteRelationship(universeId, view.id),
    })
    if (!removed) return
    if (editingId === view.id) close()
    await load()
  }

  /** Every edit merges into the latest draft, so two changes in one tick cannot drop one. */
  function edit(change: Partial<RelationDraft>) {
    setDraft((current) => (current ? { ...current, ...change } : current))
  }

  return { close, mayDiscard, openAdd, openEdit, save, remove, edit }
}
