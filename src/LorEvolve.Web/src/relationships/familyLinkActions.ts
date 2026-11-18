import { ApiError } from '../lib/api'
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
  setMessage,
  setIsSaving,
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

    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    try {
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
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('places.linkForm.fieldErrors'),
        )
      } else {
        setMessage(t('places.linkForm.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }
  return { cancel, save }
}
