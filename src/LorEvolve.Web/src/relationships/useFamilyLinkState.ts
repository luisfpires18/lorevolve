import { useState } from 'react'
import type { EntityChoice } from '../components/EntityPicker'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import type { RelationshipType } from './types'
import { CanonStatus, type CanonStatusValue } from '../lore/types'

export function useFamilyLinkState({ kinds }: { kinds: RelationshipType[] }) {
  const [kindId, setKindId] = useState(kinds[0]?.id ?? '')
  // The stored row runs source to target; for a parent kind the source is the parent.
  const [focalIsSource, setFocalIsSource] = useState(true)
  const [related, setRelated] = useState<EntityChoice | null>(null)
  const [canonStatus, setCanonStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const form = useFormSave({
    needChange: () => t('places.linkForm.fieldErrors'),
    failed: () => t('places.linkForm.failed'),
  })
  const [isCreatingKind, setIsCreatingKind] = useState(false)
  return {
    kindId,
    setKindId,
    focalIsSource,
    setFocalIsSource,
    related,
    setRelated,
    canonStatus,
    setCanonStatus,
    form,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    isSaving: form.isSaving,
    isCreatingKind,
    setIsCreatingKind,
  }
}
