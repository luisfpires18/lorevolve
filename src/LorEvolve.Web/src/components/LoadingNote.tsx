import type { ReactNode } from 'react'
import { Callout } from './Callout'

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
    <Callout look="notice" as="p" className={className} role="status" testId={testId}>
      {children}
    </Callout>
  )
}
