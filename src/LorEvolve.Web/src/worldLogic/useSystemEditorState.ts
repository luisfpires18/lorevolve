import { useCallback, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import { useQueryTab } from '../lib/queryTab'
import { useAsyncRead } from '../lib/useAsyncRead'
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
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
    fieldErrors,
    setFieldErrors,
    failure,
    setFailure,
    conflict,
    setConflict,
    saving,
    setSaving,
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
