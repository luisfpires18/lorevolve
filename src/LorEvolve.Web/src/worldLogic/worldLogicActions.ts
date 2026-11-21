import { evaluateWorldLogicFindings } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useWorldLogicState } from './useWorldLogicState'
import { pageParam } from '../lib/queryParams'

/** The World Logic page's handlers: paging a list, reading the lists again, and running the check. */
export function worldLogicActions({
  universe,
  findingsPage,
  setParams,
  setRules,
  setSystems,
  setFindings,
  setReads,
  setSweep,
  setSweeping,
  setSweepFailed,
}: ReturnType<typeof useWorldLogicState> & { universe: WorkspaceContext['universe'] }) {
  /** Moves one list to a page, leaving the other lists' pages and the chosen tab where they are. */
  function goTo(which: 'rulesPage' | 'systemsPage' | 'findingsPage', next: number) {
    // The list says it is loading from here, where the author asked for it, rather than from the effect that reads
    // it: a setState inside the effect would start a second render for something this event already knows.
    if (which === 'rulesPage') setRules({ kind: 'loading' })
    else if (which === 'systemsPage') setSystems({ kind: 'loading' })
    else setFindings({ kind: 'loading' })

    setParams((current) => pageParam(current, which, next))
  }

  function retry() {
    setRules({ kind: 'loading' })
    setSystems({ kind: 'loading' })
    setFindings({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  /**
   * Runs the check and reads the findings back. The sweep answers counts rather than rows, so the list is read again
   * afterwards; a run that found nothing is what lets the empty state say every rule passed rather than guessing.
   */
  async function check() {
    setSweeping(true)
    setSweepFailed(false)

    try {
      const result = await evaluateWorldLogicFindings(universe.id)
      setSweep(result)
      setFindings({ kind: 'loading' })
      // A new run can empty the page the author is on, so the list goes back to the first page with it.
      if (findingsPage > 1) goTo('findingsPage', 1)
      else setReads((current) => current + 1)
    } catch {
      setSweepFailed(true)
    } finally {
      setSweeping(false)
    }
  }

  /** Reads the list again after a decision, so what a row says is what the store holds. */
  function reread() {
    setReads((current) => current + 1)
  }

  return { goTo, retry, check, reread }
}
