import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { WorldLogicSweepResult } from './types'

/** A page number from the address: at least 1, and 1 for anything that is not a number. */
function asPage(written: string | null) {
  return Math.max(1, Number.parseInt(written ?? '1', 10) || 1)
}

/** The World Logic page's state: each list's page from the address, and the last check run here. */
export function useWorldLogicState() {
  // Each list keeps its own page in the address, so a link lands on the page it was taken from and the two cannot
  // read each other's: both panels stay mounted, so one shared number would page the list nobody is looking at.
  const [params, setParams] = useSearchParams()
  const rulesPage = asPage(params.get('rulesPage'))
  const systemsPage = asPage(params.get('systemsPage'))
  const findingsPage = asPage(params.get('findingsPage'))

  // The last check run from this page, which is the only thing that can tell "nothing found" from "nothing ran":
  // the store keeps findings, not sweeps, so a reload forgets this and the empty state says both again.
  const [sweep, setSweep] = useState<WorldLogicSweepResult | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const [sweepFailed, setSweepFailed] = useState(false)

  return {
    params,
    setParams,
    rulesPage,
    systemsPage,
    findingsPage,
    sweep,
    setSweep,
    sweeping,
    setSweeping,
    sweepFailed,
    setSweepFailed,
  }
}
