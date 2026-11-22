import { useRef, useState } from 'react'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import type { TimelineEntry, TimelineStoryLink } from './types'
import { DETAIL_ERROR_KEYS, draftFrom, EMPTY, type MomentDraft } from './momentDraft'
import { useDraftForm } from '../lib/useDraftForm'

/** The moment drawer's title ref and state, with the draft it opened on. */
export function useMomentFormState({
  entry,
  initialStories,
  measure,
}: {
  entry: TimelineEntry | null
  initialStories: TimelineStoryLink[]
  /** The draft as the save would send it, for `isDirty`. */
  measure: (draft: MomentDraft) => object
}) {
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the moment as stored, or the blank form - which the draft is measured against.
  const drafted = useDraftForm<MomentDraft>(
    () => (entry ? draftFrom(entry) : { ...EMPTY, stories: initialStories }),
    { measure },
  )
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(() => entry?.validation != null)
  const form = useFormSave({
    // The gate's refusal is its own thing: the draft below is intact and the only
    // useful thing to say is what disagreed with it.
    refusal: (error) => {
      const blocking = blockingFindingsOf(error)
      if (!blocking) return false
      setBlocked(blocking)
      return true
    },
    needChange: () => t('time.momentForm.needChange'),
    failed: () => t('time.momentForm.saveFailed'),
    onFieldErrors: (fieldErrors) => {
      if (Object.values(DETAIL_ERROR_KEYS).some((key) => fieldErrors[key])) {
        setDetailsOpen(true)
      }
    },
  })

  return {
    title,
    ...drafted,
    form,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    blocked,
    setBlocked,
    isSaving: form.isSaving,
    detailsOpen,
    setDetailsOpen,
  }
}
