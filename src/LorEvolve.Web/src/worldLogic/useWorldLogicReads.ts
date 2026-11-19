import { useEffect } from 'react'
import { t } from '../i18n'
import { errorText } from '../lib/errorText'
import { listSystems, listWorldLogicFindings, listWorldLogicRules } from './api'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useWorldLogicState } from './useWorldLogicState'

/** The World Logic page's three reads: the rules, the Systems and the findings, each on its own page. */
export function useWorldLogicReads({
  universe,
  rulesPage,
  systemsPage,
  findingsPage,
  reads,
  setRules,
  setSystems,
  setFindings,
}: ReturnType<typeof useWorldLogicState> & { universe: WorkspaceContext['universe'] }) {
  useEffect(() => {
    const controller = new AbortController()

    listWorldLogicRules(universe.id, rulesPage, controller.signal)
      .then((page) => setRules({ kind: 'ready', value: page }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRules({ kind: 'error', message: errorText(error, t('shell.app.loadFailed')) })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, rulesPage, reads])

  useEffect(() => {
    const controller = new AbortController()

    listSystems(universe.id, systemsPage, controller.signal)
      .then((page) => setSystems({ kind: 'ready', value: page }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSystems({ kind: 'error', message: errorText(error, t('shell.app.loadFailed')) })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, systemsPage, reads])

  useEffect(() => {
    const controller = new AbortController()

    listWorldLogicFindings(universe.id, findingsPage, controller.signal)
      .then((page) => setFindings({ kind: 'ready', value: page }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setFindings({ kind: 'error', message: errorText(error, t('shell.app.loadFailed')) })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, findingsPage, reads])
}
