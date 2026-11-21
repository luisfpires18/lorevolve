import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from './EmptyState'

/**
 * The EmptyState of a thing that is not here, with the one link back to where it was listed. `backIn` says where the
 * link sits: after the hint's words (`hint`, the default) or as the state's action (`action`). Catalogue:
 * docs/design/ui-components.md.
 */
export function MissingState({
  title,
  hint,
  backTo,
  backLabel,
  backTestId,
  backIn = 'hint',
  testId,
}: {
  title: ReactNode
  hint?: ReactNode
  backTo: string
  backLabel: ReactNode
  backTestId?: string
  backIn?: 'hint' | 'action'
  testId: string
}) {
  const back = (
    <Link to={backTo} data-testid={backTestId}>
      {backLabel}
    </Link>
  )
  return backIn === 'action' ? (
    <EmptyState title={title} hint={hint} action={back} testId={testId} />
  ) : (
    <EmptyState
      title={title}
      hint={
        <>
          {hint} {back}
        </>
      }
      testId={testId}
    />
  )
}
