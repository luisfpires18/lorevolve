import type { ReactNode } from 'react'

/** A read in progress: one quiet line that screen readers hear. */
export function LoadingNote({
  children,
  testId,
  className,
}: {
  children: ReactNode
  testId?: string
  className?: string
}) {
  return (
    <p className={className ? `notice ${className}` : 'notice'} role="status" data-testid={testId}>
      {children}
    </p>
  )
}
