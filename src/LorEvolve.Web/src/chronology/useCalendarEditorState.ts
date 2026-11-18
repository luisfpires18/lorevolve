import { useEffect, useId, useRef, useState } from 'react'
import type { ChronologyCalendar } from './types'
import { draftsFrom, type Mode } from './monthDrafts'

/** The calendar editor's state, with the effects that follow the stored calendar and focus a new month. */
export function useCalendarEditorState({
  stored,
  storedMode,
}: {
  stored: ChronologyCalendar | null
  storedMode: Mode
}) {
  const [mode, setMode] = useState<Mode>(storedMode)
  const [drafts, setDrafts] = useState(() => draftsFrom(stored))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [moved, setMoved] = useState('')
  const headingId = useId()
  const statusId = useId()
  const touched = useRef(false)
  const created = useRef(0)
  const focusNew = useRef<string | null>(null)

  // The workspace's chronology can be read again under this screen - the date periods' editor does on opening - and an
  // untouched calendar follows it.
  useEffect(() => {
    if (touched.current) return
    setMode(stored ? 'custom' : 'simple')
    setDrafts(draftsFrom(stored))
  }, [stored])

  useEffect(() => {
    if (!focusNew.current) return
    document.getElementById(focusNew.current)?.focus()
    focusNew.current = null
  }, [drafts])

  return {
    mode,
    setMode,
    drafts,
    setDrafts,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    saving,
    setSaving,
    saves,
    setSaves,
    moved,
    setMoved,
    headingId,
    statusId,
    touched,
    created,
    focusNew,
  }
}
