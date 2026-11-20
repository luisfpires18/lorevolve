import { t } from '../../i18n'
import { Link } from 'react-router-dom'
import { CanonBlockNotice } from '../CanonBlockNotice'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useTrashState } from '../../trash/useTrashState'
import { ReadGate } from '../ReadGate'
import { Callout } from '../Callout'

/** What stands above the list: a refused restore's findings, what a restore did, loading, and a failed read. */
export function TrashNotices({
  universe,
  load,
  state,
  blocked,
  outcome,
}: Pick<ReturnType<typeof useTrashState>, 'state' | 'blocked' | 'outcome'> & {
  universe: WorkspaceContext['universe']
  load: (signal?: AbortSignal) => void
}) {
  return (
    <>
      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {/* The row that was restored leaves the list, taking the focus with it: the focus goes to what happened instead. */}
      {outcome ? (
        <Callout look="notice" className="trash__outcome" focusOnShow={outcome}>
          <p role="status" data-testid="trash-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="trash-open">
              {outcome.link.label}
            </Link>
          ) : null}
        </Callout>
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
