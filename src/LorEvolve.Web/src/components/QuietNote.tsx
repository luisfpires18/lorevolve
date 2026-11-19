import type { ReactNode } from 'react'

/**
 * A quiet line in a panel: nothing yet, a hint, a detail. The colour and size live here; the class passed in keeps
 * only the screen's spacing. `size` defaults to the small text token.
 */
export function QuietNote({
  children,
  size,
  wrap,
  testId,
  className,
  id,
  role,
  dir,
}: {
  children: ReactNode
  size?: 'ui' | 'xs'
  wrap?: boolean
  testId?: string
  className?: string
  id?: string
  /** `status` when the line changes as the reader works, so screen readers hear it. */
  role?: 'status'
  dir?: 'auto'
}) {
  const classes = ['quietnote', size && `quietnote--${size}`, wrap && 'quietnote--wrap', className]
  return (
    <p
      className={classes.filter(Boolean).join(' ')}
      data-testid={testId}
      id={id}
      role={role}
      dir={dir}
    >
      {children}
    </p>
  )
}
