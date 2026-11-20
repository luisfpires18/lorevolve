import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import { CanonBlockNotice } from '../CanonBlockNotice'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useTrashState } from '../../trash/useTrashState'
import { ReadGate } from '../ReadGate'

/** What stands above the list: a refused restore's findings, what a restore did, loading, and a failed read. */
export function TrashNotices({
  universe,
  load,
  state,
  blocked,
  outcome,
  outcomeRef,
}: Pick<ReturnType<typeof useTrashState>, 'state' | 'blocked' | 'outcome' | 'outcomeRef'> & {
  universe: WorkspaceContext['universe']
  load: (signal?: AbortSignal) => void
}) {
  return (
    <>
      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {outcome ? (
        <div className="notice trash__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="trash-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="trash-open">
              {outcome.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* The list itself is drawn below the notices. */}
      <ReadGate
        load={state}
        loading={{ text: t('data.trash.loading') }}
        error={{ onRetry: () => load(), retryLabel: t('data.trash.retry') }}
      >
        {() => null}
      </ReadGate>
    </>
  )
}
