import { useCallback, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { useQueryTab } from '../lib/queryTab'
import { useAsyncRead } from '../lib/useAsyncRead'
import { useFormSave } from '../lib/useFormSave'
import { getSystem } from './api'
import type { BaseVersions } from './machine'
import type { SystemDetail } from './types'

/** The System editor's state, its tabs and the effect that reads the System. */
export function useSystemEditorState({
  universeId,
  systemId,
}: {
  universeId: string
  systemId: string | null
}) {
  const headingId = useId()
  const nameId = useId()
  const summaryId = useId()
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [saved, setSaved] = useState<SystemDetail | null>(null)
  const [conflict, setConflict] = useState(false)
  // A System changed elsewhere opens the conflict, a taken name marks the name, a System gone says so; only a 400 names
  // fields.
  const form = useFormSave({
    needChange: () => t('canon.worldLogic.systems.editor.invalid'),
    failed: () => t('canon.worldLogic.systems.editor.saveFailed'),
    badRequestOnly: true,
    refusal: (error) => {
      if (!(error instanceof ApiError)) return false
      if (error.status === 409 && error.code === 'system_changed') {
        setConflict(true)
        return true
      }
      if (error.status === 409 && error.code === 'system_name_taken') {
        form.setFieldErrors({ name: t('canon.worldLogic.systems.editor.nameTaken') })
        return true
      }
      return error.status === 404 ? t('canon.worldLogic.systems.editor.gone') : false
    },
  })
  const [announcement, setAnnouncement] = useState('')
  const [bases, setBases] = useState<BaseVersions>({ details: 0, machine: 0 })
  const machineDirty = useRef(false)

  const tabs = [
    { id: 'details' as const, label: t('canon.worldLogic.systems.editor.tabs.details') },
    { id: 'machine' as const, label: t('canon.worldLogic.systems.editor.tabs.machine') },
  ]
  const [tab, choose] = useQueryTab(tabs)

  // A new System has nothing to read: it starts ready and empty.
  const read = useCallback(
    (signal: AbortSignal) =>
      systemId
        ? getSystem(universeId, systemId, signal).then((system) => {
            setSaved(system)
            setBases({ details: system.version, machine: system.version })
            setName(system.name)
            setSummary(system.summary)
            return system as SystemDetail | null
          })
        : undefined,
    [universeId, systemId],
  )
  const { load, retry } = useAsyncRead<SystemDetail | null>(read, {
    missing: true,
    initial: systemId ? undefined : { kind: 'ready', value: null },
  })

  return {
    headingId,
    nameId,
    summaryId,
    load,
    retry,
    name,
    setName,
    summary,
    setSummary,
    saved,
    setSaved,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    failure: form.message,
    setFailure: form.setMessage,
    conflict,
    setConflict,
    saving: form.isSaving,
    runSave: form.save,
    announcement,
    setAnnouncement,
    bases,
    setBases,
    machineDirty,
    tab,
    choose,
    tabs,
  }
}
