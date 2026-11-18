import { useState } from 'react'
import type { EntityChoice } from '../components/EntityPicker'
import type { RelationshipType } from './types'
import { CanonStatus, type CanonStatusValue } from '../lore/types'

export function useFamilyLinkState({ kinds }: { kinds: RelationshipType[] }) {
  const [kindId, setKindId] = useState(kinds[0]?.id ?? '')
  // The stored row runs source to target; for a parent kind the source is the parent.
  const [focalIsSource, setFocalIsSource] = useState(true)
  const [related, setRelated] = useState<EntityChoice | null>(null)
  const [canonStatus, setCanonStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
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
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
    isCreatingKind,
    setIsCreatingKind,
  }
}
