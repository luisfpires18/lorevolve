import type { ReactNode } from 'react'

/**
 * What a list or view says when there is nothing in it: one line, a hint that says how to begin,
 * and the one action that begins it - the same action the page's header offers, never a third.
 * No illustration, no big icon: the words and the button are the help.
 */
export function EmptyState({
  title,
  hint,
  action,
  testId,
}: {
  title: ReactNode
  hint?: ReactNode
  /** The primary next step, and a secondary only if the screen genuinely has two. */
  action?: ReactNode
  testId?: string
}) {
  return (
    <div className="empty" data-testid={testId}>
      <p className="empty__line">{title}</p>
      {hint ? <p className="empty__hint">{hint}</p> : null}
      {action ? <div className="empty__actions">{action}</div> : null}
    </div>
  )
}
