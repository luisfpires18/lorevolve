import { createRelationship } from './api'
import type { RelationshipType } from './types'
import { confirmDiscard } from '../lib/confirm'
import { useI18n } from '../i18n'
import type { useFamilyLinkState } from './useFamilyLinkState'

export function familyLinkActions({
  universeId,
  focal,
  kind,
  asSource,
  isDirty,
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
  isDirty: boolean
  onSaved: () => void
  onCancel: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  async function cancel() {
    if (isDirty && !(await confirmDiscard())) return
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
