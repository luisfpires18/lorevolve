import type { ReactNode } from 'react'

/** A message for screen readers only. `inline` draws a span, for a place a paragraph may not go (inside a button). */
export function Announce({
  children,
  testId,
  id,
  inline,
  state,
}: {
  children: ReactNode
  testId?: string
  id?: string
  inline?: boolean
  /** Read by tests and styles as `data-state`. */
  state?: string
}) {
  const Tag = inline ? 'span' : 'p'
  return (
    <Tag
      className="visually-hidden"
      role="status"
      aria-live="polite"
      data-testid={testId}
      id={id}
      data-state={state}
    >
      {children}
    </Tag>
  )
}
