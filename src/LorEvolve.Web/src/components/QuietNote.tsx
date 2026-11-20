import type { ReactNode } from 'react'

/**
 * A quiet line in a panel: nothing yet, a hint, a detail. The colour and size live here; the class passed in keeps
 * only the screen's own spacing. `size` defaults to the small text token. `spacing="block"` is a settings note
 * (the small text, a gap below, a roomy line height); `tone="saved"` is the accent line that says a change was saved. `size="body"` takes the surrounding text size; `spacing="hint"` is a hint with a gap below; `spacing="flush"` has no margin.
 */
export function QuietNote({
  children,
  size,
  spacing,
  tone,
  wrap,
  testId,
  className,
  id,
  role,
  dir,
  as: Tag = 'p',
}: {
  children: ReactNode
  size?: 'ui' | 'xs' | 'body'
  spacing?: 'block' | 'hint' | 'flush'
  tone?: 'saved'
  wrap?: boolean
  testId?: string
  className?: string
  id?: string
  /** `status` when the line changes as the reader works, so screen readers hear it. */
  role?: 'status'
  dir?: 'auto'
  /** `span` for a note that sits inside a sentence of its own. */
  as?: 'p' | 'span'
}) {
  const classes = [
    'quietnote',
    size && `quietnote--${size}`,
    spacing && `quietnote--${spacing}`,
    tone && `quietnote--${tone}`,
    wrap && 'quietnote--wrap',
    className,
  ]
  return (
    <Tag
      className={classes.filter(Boolean).join(' ')}
      data-testid={testId}
      id={id}
      role={role}
      dir={dir}
    >
      {children}
    </Tag>
  )
}
