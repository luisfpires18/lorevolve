import { emptyValue, valuedFields } from './document'
import { blockingFindingsOf } from '../canon/blocked'
import { isChangedElsewhere } from '../lib/editConflict'
import { deleteEntity, ENTRY_CHANGED, getEntity, updateEntity } from './api'
import type { CanonStatusValue } from './types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../i18n'
import { draftFromDetail } from './entryDraft'
import type { NavigateFunction } from 'react-router-dom'
import type { useEntryLoad } from './useEntryLoad'
import type { useEntryState } from './useEntryState'

/** The entry's one-press writes: a Canon status change and Move to Trash. */
export function useEntryActions({
  draft,
  setDraft,
  isEditing,
  setMessage,
  setBlocked,
  runSave,
  selectedType,
  universe,
  entityId,
  detail,
  setDetail,
  setHistoryKey,
  navigate,
}: ReturnType<typeof useEntryState> &
  ReturnType<typeof useEntryLoad> & {
    universe: { id: string }
    entityId: string | undefined
    isEditing: boolean
    navigate: NavigateFunction
  }) {
  const { t } = useI18n()
  const isNew = entityId === undefined

  /**
   * The one-click promotion, which saves on the spot rather than through the editor.
   *
   * It is a gated write like any other, so a refusal has to read as one: the same notice
   * the edit form shows, and the step the author had before, because nothing moved. The
   * optimistic step is rolled back on any failure - leaving it pressed would claim a
   * status the server refused.
   */
  async function changeCanon(next: CanonStatusValue) {
    if (!draft) return
    const previous = draft.canonStatus
    const updated = { ...draft, canonStatus: next }
    setDraft(updated)

    if (isNew || isEditing) return

    setBlocked(null)
    // Every refusal is handled inside: the step is rolled back first, then the words are its own.
    await runSave(async () => {
      try {
        const definitions = selectedType?.fields ?? []
        const saved = await updateEntity(universe.id, entityId, {
          entityTypeId: updated.entityTypeId,
          name: updated.name,
          summary: updated.summary.trim() ? updated.summary.trim() : null,
          canonStatus: next,
          aliases: updated.aliases,
          tags: updated.tags,
          fields: valuedFields(definitions).map(
            (definition) => updated.fields[definition.id] ?? emptyValue(definition),
          ),
          expectedVersion: detail?.version,
        })
        setDetail(saved)
        setDraft(draftFromDetail(saved))
        setHistoryKey((key) => key + 1)
      } catch (error: unknown) {
        setDraft({ ...updated, canonStatus: previous })

        const blocking = blockingFindingsOf(error)
        if (blocking) {
          setBlocked(blocking)
        } else if (isChangedElsewhere(error, ENTRY_CHANGED) && entityId !== undefined) {
          // Nothing unsaved is at stake here: the page reads the entry as it now is, and the author chooses again.
          try {
            const latest = await getEntity(universe.id, entityId)
            setDetail(latest)
            setDraft(draftFromDetail(latest))
            setHistoryKey((key) => key + 1)
          } catch {
            /* The message below still holds; the page shows what it last read. */
          }
          setMessage(t('entity.page.canon.changedElsewhere'))
        } else {
          setMessage(t('entity.page.canon.failed'))
        }
      }
    })
  }

  /**
   * Moves the entry to the Trash. Nothing is destroyed, and the wording says so: the article,
   * the fields, the history and every connection stay stored, and Trash restores them whole.
   */
  async function moveToTrash() {
    if (isNew) return
    const trashed = await confirmAction({
      title: t('entity.page.trash.title'),
      message: t('entity.page.trash.message'),
      confirmLabel: t('entity.page.trash.confirm'),
      busyLabel: t('entity.page.trash.busy'),
      variant: 'warning',
      failure: t('entity.page.trash.failed'),
      action: () => deleteEntity(universe.id, entityId),
    })
    if (trashed) await navigate(`/app/universes/${universe.id}/trash`, { replace: true })
  }
  return { changeCanon, moveToTrash }
}
