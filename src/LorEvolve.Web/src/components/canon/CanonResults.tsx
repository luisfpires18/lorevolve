import type { useUniverseAccess } from '../../universes/access'
import { CanonConflictStatus, CONFLICT_STATUS_LABELS } from '../../canon/types'
import type { CanonConflictPage } from '../../canon/types'
import { ConflictEntry } from '../ConflictEntry'
import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useCanonConflicts } from '../../canon/useCanonConflicts'
import type { canonActions } from '../../canon/canonActions'
import { emptyLine, hint } from '../../canon/canonEmptyCopy'

/** The Canon page's results: the last run, the error, loading and failed lines, the ledger, the empty state and the pager. */
export function CanonResults({
  universe,
  access,
  result,
  status,
  severity,
  setPage,
  state,
  reload,
  message,
  isEvaluating,
  evaluation,
  busyId,
  evaluate,
  transition,
}: Pick<
  ReturnType<typeof useCanonConflicts>,
  | 'status'
  | 'severity'
  | 'setPage'
  | 'state'
  | 'reload'
  | 'message'
  | 'isEvaluating'
  | 'evaluation'
  | 'busyId'
> &
  ReturnType<typeof canonActions> & {
    universe: WorkspaceContext['universe']
    access: ReturnType<typeof useUniverseAccess>
    result: CanonConflictPage | null
  }) {
  return (
    <>
      {evaluation ? (
        <p className="integrity__run" role="status" data-testid="canon-run">
          {t('canon.page.run', {
            detected: evaluation.detected,
            created: evaluation.created,
            reopened: evaluation.reopened,
            resolved: evaluation.resolved,
          })}
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="canon-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('canon.page.loading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--secondary" type="button" onClick={reload}>
            {t('canon.page.retry')}
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <h2 className="visually-hidden">
          {t('canon.page.findingsHeading', { status: CONFLICT_STATUS_LABELS[status] })}
        </h2>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="integrity__ledger" data-testid="canon-ledger">
          {result.items.map((conflict) => (
            <ConflictEntry
              key={conflict.id}
              universeId={universe.id}
              conflict={conflict}
              isBusy={busyId === conflict.id}
              onDismiss={() => void transition(conflict.id, 'dismiss')}
              onReopen={() => void transition(conflict.id, 'reopen')}
            />
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="canon-empty"
          title={emptyLine(status, severity)}
          hint={severity !== null ? t('canon.page.otherSeverity') : hint(status)}
          action={
            access.editContent && severity === null && status === CanonConflictStatus.Pending ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void evaluate()}
                disabled={isEvaluating}
                data-testid="empty-evaluate-canon"
              >
                {isEvaluating ? t('canon.page.emptyEvaluating') : t('canon.page.emptyEvaluate')}
              </button>
            ) : undefined
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('canon.page.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('canon.page.previous')}
          </button>
          <span className="pager__position">
            {t('canon.page.position', { page: result.page, totalPages: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('canon.page.next')}
          </button>
        </nav>
      ) : null}
    </>
  )
}
