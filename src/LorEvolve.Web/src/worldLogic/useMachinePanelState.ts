import { useEffect, useId, useRef, useState } from 'react'
import type { MachineSelection } from '../components/SystemMachineCanvas'
import { getSystemMachine, listSystemRules } from './api'
import { docOf, EMPTY_MACHINE, type MachineDoc, type Point } from './machine'
import type { SystemMachineDetail, SystemMachineTryResult, SystemRuleSummary } from './types'
import type { Open, Errors, Rules } from './machinePanelTypes'

/** The machine panel's state, with the effects that read the machine and the rules a guard may name. */
export function useMachinePanelState({
  universeId,
  systemId,
  projectId,
  onLoaded,
}: {
  universeId: string
  systemId: string
  projectId: string | null
  onLoaded: (version: number) => void
}) {
  const statusId = useId()
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<MachineDoc>(EMPTY_MACHINE)
  const [draft, setDraft] = useState<MachineDoc>(EMPTY_MACHINE)
  // The server's counts, read with the machine and again with each save: a draft edit does not move them.
  const [openFindings, setOpenFindings] = useState<SystemMachineDetail['openFindings']>([])
  const [tried, setTried] = useState<SystemMachineTryResult | null>(null)
  const [rules, setRules] = useState<Rules>(null)
  const [selected, setSelected] = useState<MachineSelection>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const inFlight = useRef(false)
  const centreRef = useRef<(() => Point) | null>(null)
  const latest = useRef({ onLoaded })

  useEffect(() => {
    latest.current = { onLoaded }
  })

  useEffect(() => {
    const controller = new AbortController()
    getSystemMachine(universeId, systemId, controller.signal)
      .then((detail) => {
        const doc = docOf(detail)
        setStored(doc)
        setDraft(doc)
        setOpenFindings(detail.openFindings)
        setLoad('ready')
        latest.current.onLoaded(detail.version)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad('error')
      })
    return () => controller.abort()
  }, [universeId, systemId, reads])

  // Every rule definition a guard may name: the universe's, and this System's project's when it has one.
  useEffect(() => {
    const controller = new AbortController()
    async function readAll() {
      const all: SystemRuleSummary[] = []
      for (let page = 1; ; page += 1) {
        const result = await listSystemRules(universeId, page, controller.signal)
        all.push(...result.items)
        if (page >= result.totalPages) return all
      }
    }
    readAll()
      .then((all) =>
        setRules(all.filter((rule) => rule.projectId === null || rule.projectId === projectId)),
      )
      .catch(() => {
        if (!controller.signal.aborted) setRules('failed')
      })
    return () => controller.abort()
  }, [universeId, projectId])

  return {
    statusId,
    load,
    setLoad,
    reads,
    setReads,
    stored,
    setStored,
    draft,
    setDraft,
    openFindings,
    setOpenFindings,
    tried,
    setTried,
    rules,
    setRules,
    selected,
    setSelected,
    connecting,
    setConnecting,
    open,
    setOpen,
    errors,
    setErrors,
    failure,
    setFailure,
    conflict,
    setConflict,
    saving,
    setSaving,
    saves,
    setSaves,
    inFlight,
    centreRef,
    latest,
  }
}
