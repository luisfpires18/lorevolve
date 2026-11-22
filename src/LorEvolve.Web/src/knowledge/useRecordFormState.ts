import { useId, useState } from 'react'
import type { KnowledgeRecord } from './api'
import { draftOf, type Draft, type Side } from './recordDraft'

/** A knowledge record drawer's ids and state, with the draft read once from the record. */
export function useRecordFormState({
  record,
  side,
}: {
  record: KnowledgeRecord | null
  side: Side
}) {
  const headingId = useId()
  const statementId = useId()
  const storyId = useId()
  const sceneId = useId()
  const startId = useId()
  const [initial] = useState(() => draftOf(record, side))
  const [draft, setDraft] = useState<Draft>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  return {
    headingId,
    statementId,
    storyId,
    sceneId,
    startId,
    initial,
    draft,
    setDraft,
    errors,
    setErrors,
    message,
    setMessage,
    isSaving,
    setIsSaving,
  }
}
