import type { ReactNode } from 'react'

/** A confirmation after a create or delete, shown once, with an optional link to what was made. */
export function OutcomeNotice({
  children,
  link,
  testId,
  className,
}: {
  children: ReactNode
  link?: ReactNode
  testId: string
  className?: string
}) {
  return (
    <div className={className ? `notice ${className}` : 'notice'} data-testid={testId}>
      <p role="status">
        {children}
        {link && <> {link}</>}
      </p>
    </div>
  )
}
