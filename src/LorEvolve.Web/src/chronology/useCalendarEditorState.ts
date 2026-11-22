import { useEffect, useId, useRef, useState } from 'react'
import type { ChronologyCalendar } from './types'
import { draftsFrom, type Mode } from './monthDrafts'
import { t } from '../i18n'
import { useFormSave } from '../lib/useFormSave'

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
  // A refused month list shows the API's own words; other refused fields ask for a change.
  const form = useFormSave({
    needChange: (fieldErrors, error) =>
      fieldErrors.months ? error.message : t('time.calendar.monthsNeedChange'),
    failed: () => t('time.calendar.saveFailed'),
  })
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
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    message: form.message,
    setMessage: form.setMessage,
    saving: form.isSaving,
    runSave: form.save,
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
