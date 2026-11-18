import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { useQueryTab } from '../lib/queryTab'
import { getSystem } from './api'
import type { BaseVersions } from './machine'
import type { SystemDetail } from './types'

export type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; system: SystemDetail | null }
  | { kind: 'missing' }
  | { kind: 'error' }

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
  const [load, setLoad] = useState<Load>(
    systemId ? { kind: 'loading' } : { kind: 'ready', system: null },
  )
  const [reads, setReads] = useState(0)
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

  useEffect(() => {
    if (!systemId) return
    const controller = new AbortController()

    getSystem(universeId, systemId, controller.signal)
      .then((system) => {
        setSaved(system)
        setBases({ details: system.version, machine: system.version })
        setName(system.name)
        setSummary(system.summary)
        setLoad({ kind: 'ready', system })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, systemId, reads])

  return {
    headingId,
    nameId,
    summaryId,
    load,
    setLoad,
    reads,
    setReads,
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
