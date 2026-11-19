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
import { Button } from '../Button'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

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

      {state.kind === 'loading' ? <LoadingNote>{t('canon.page.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError message={state.message} onRetry={reload} retryLabel={t('canon.page.retry')} />
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
              <Button
                tone="secondary"
                onClick={() => void evaluate()}
                disabled={isEvaluating}
                data-testid="empty-evaluate-canon"
              >
                {isEvaluating ? t('canon.page.emptyEvaluating') : t('canon.page.emptyEvaluate')}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('canon.page.pagination')}>
          <Button
            tone="secondary"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('canon.page.previous')}
          </Button>
          <span className="pager__position">
            {t('canon.page.position', { page: result.page, totalPages: result.totalPages })}
          </span>
          <Button
            tone="secondary"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('canon.page.next')}
          </Button>
        </nav>
      ) : null}
    </>
  )
}
