import { useRef, useState } from 'react'
import type { CanonBlockingFinding } from '../canon/types'
import type { TimelineEntry, TimelineStoryLink } from './types'
import { draftFrom, EMPTY, type MomentDraft } from './momentDraft'

/** The moment drawer's title ref and state, with the draft it opened on. */
export function useMomentFormState({
  entry,
  initialStories,
}: {
  entry: TimelineEntry | null
  initialStories: TimelineStoryLink[]
}) {
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the moment as stored, or the blank form - which the draft is measured against.
  const [initial] = useState<MomentDraft>(() =>
    entry ? draftFrom(entry) : { ...EMPTY, stories: initialStories },
  )
  const [draft, setDraft] = useState<MomentDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => entry?.validation != null)

  return {
    title,
    initial,
    draft,
    setDraft,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    blocked,
    setBlocked,
    isSaving,
    setIsSaving,
    detailsOpen,
    setDetailsOpen,
  }
}
