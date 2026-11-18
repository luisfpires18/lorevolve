import { useEffect, useId, useRef, useState } from 'react'
import type { CanonBlockingFinding } from '../canon/types'
import { getChronology } from './api'
import type { Chronology } from './types'
import { draftsFrom } from './eraDrafts'

/** The date periods editor's state, with the read that refreshes the stored chronology on opening. */
export function useChronologyEditorState({
  universeId,
  chronology,
  onSaved,
}: {
  universeId: string
  chronology: Chronology
  onSaved: (next: Chronology) => void
}) {
  const [stored, setStored] = useState(chronology)
  const [drafts, setDrafts] = useState(() => draftsFrom(chronology))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  // Said aloud after a move, since the list reorders under the focused button.
  const [moved, setMoved] = useState('')
  const statusId = useId()
  const headingId = useId()
  // The period just added, whose name takes the focus once it is drawn.
  const focusNew = useRef<string | null>(null)
  const touched = useRef(false)
  const created = useRef(0)

  // The workspace read the chronology when the universe opened. How much is dated in each period
  // may have moved since, so this screen asks again - without trampling an edit already begun.
  useEffect(() => {
    const controller = new AbortController()

    getChronology(universeId, controller.signal)
      .then((fresh) => {
        setStored(fresh)
        if (!touched.current) setDrafts(draftsFrom(fresh))
        onSaved(fresh)
      })
      .catch(() => {
        // The workspace's copy stands in; saving still reports anything that has moved.
      })

    return () => {
      controller.abort()
    }
  }, [universeId, onSaved])

  return {
    stored,
    setStored,
    drafts,
    setDrafts,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    blocked,
    setBlocked,
    saving,
    setSaving,
    saves,
    setSaves,
    moved,
    setMoved,
    statusId,
    headingId,
    focusNew,
    touched,
    created,
  }
}
