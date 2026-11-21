import { useCallback } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { listSystems, listWorldLogicFindings, listWorldLogicRules } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useWorldLogicState } from './useWorldLogicState'

// A page change keeps the list shown until the new page lands (goTo says loading itself), and a quiet read again that
// fails says so, as the lists always have.
const OPTIONS = { keep: true, keepOnFailure: false } as const

/** The World Logic page's three reads: the rules, the Systems and the findings, each on its own page. */
export function useWorldLogicReads({
  universe,
  rulesPage,
  systemsPage,
  findingsPage,
}: Pick<ReturnType<typeof useWorldLogicState>, 'rulesPage' | 'systemsPage' | 'findingsPage'> & {
  universe: WorkspaceContext['universe']
}) {
  const rules = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => listWorldLogicRules(universe.id, rulesPage, signal),
      [universe.id, rulesPage],
    ),
    OPTIONS,
  )
  const systems = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => listSystems(universe.id, systemsPage, signal),
      [universe.id, systemsPage],
    ),
    OPTIONS,
  )
  const findings = useAsyncRead(
    useCallback(
      (signal: AbortSignal) => listWorldLogicFindings(universe.id, findingsPage, signal),
      [universe.id, findingsPage],
    ),
    OPTIONS,
  )
  return { rules, systems, findings }
}
