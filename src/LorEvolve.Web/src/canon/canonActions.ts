import { dismissCanonConflict, evaluateCanonIntegrity, reopenCanonConflict } from './api'
import type { CanonConflictPage } from './types'
import { ApiError } from '../lib/api'
import { t } from '../i18n'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useCanonConflicts } from './useCanonConflicts'

/** The Canon page's handlers: running the check, and dismissing or reopening one finding. */
export function canonActions({
  universe,
  result,
  page,
  setPage,
  setMessage,
  setIsEvaluating,
  setEvaluation,
  setBusyId,
  reload,
}: ReturnType<typeof useCanonConflicts> & {
  universe: WorkspaceContext['universe']
  result: CanonConflictPage | null
}) {
  async function evaluate() {
    setMessage(null)
    setIsEvaluating(true)
    try {
      setEvaluation(await evaluateCanonIntegrity(universe.id))
      setPage(1)
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('canon.page.evaluateFailed'))
    } finally {
      setIsEvaluating(false)
    }
  }

  /**
   * A transition answers with the conflict as it now stands, but the list it belongs to is
   * filtered by status, so the row usually has to leave. Reloading is both simpler and
   * more honest than patching it in place under a filter it no longer matches.
   */
  async function transition(conflictId: string, action: 'dismiss' | 'reopen') {
    setMessage(null)
    setBusyId(conflictId)
    try {
      await (action === 'dismiss'
        ? dismissCanonConflict(universe.id, conflictId)
        : reopenCanonConflict(universe.id, conflictId))

      if (result && result.items.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        reload()
      }
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('canon.page.changeFailed'))
    } finally {
      setBusyId(null)
    }
  }

  return { evaluate, transition }
}
