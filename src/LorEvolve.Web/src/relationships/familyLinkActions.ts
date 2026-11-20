import { createRelationship } from './api'
import type { RelationshipType } from './types'
import { useI18n } from '../i18n'
import type { useFamilyLinkState } from './useFamilyLinkState'

export function familyLinkActions({
  universeId,
  focal,
  kind,
  asSource,
  confirmLeave,
  onSaved,
  onCancel,
  related,
  canonStatus,
  setFieldErrors,
  form,
  t,
}: ReturnType<typeof useFamilyLinkState> & {
  universeId: string
  focal: { id: string; name: string }
  kind: RelationshipType | undefined
  asSource: boolean
  /** The form's discard guard: true when there is nothing to lose or the author lets it go. */
  confirmLeave: () => Promise<boolean>
  onSaved: () => void
  onCancel: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  async function cancel() {
    if (!(await confirmLeave())) return
    onCancel()
  }

  async function save() {
    if (!kind) return

    if (!related) {
      setFieldErrors({ targetentityid: t('places.linkForm.chooseEntry') })
      return
    }

    await form.save(async () => {
      await createRelationship(universeId, {
        relationshipTypeId: kind.id,
        sourceEntityId: asSource ? focal.id : related.id,
        targetEntityId: asSource ? related.id : focal.id,
        canonStatus,
        startDate: null,
        endDate: null,
        notes: null,
      })
      onSaved()
    })
  }
  return { cancel, save }
}
