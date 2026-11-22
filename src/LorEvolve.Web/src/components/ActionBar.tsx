import type { ReactNode } from 'react'
import { QuietNote } from './QuietNote'

/**
 * The bar stuck across the foot of a form or a selection: a status line screen readers hear (`role="status"`) and the
 * bar's buttons. The caller owns the buttons and their focus refs; `className` places the bar on its screen.
 * Catalogue: docs/design/ui-components.md.
 */
export function ActionBar({
  status,
  statusTestId,
  testId,
  className,
  children,
}: {
  status: ReactNode
  statusTestId: string
  testId?: string
  className?: string
  children: ReactNode
}) {
  return (
    <footer className={['actionbar', className].filter(Boolean).join(' ')} data-testid={testId}>
      <QuietNote className="actionbar__status" testId={statusTestId} role="status">
        {status}
      </QuietNote>
      <div className="actions actions--tight actionbar__actions">{children}</div>
    </footer>
  )
}
