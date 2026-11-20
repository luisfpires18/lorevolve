import { useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode, Ref } from 'react'

interface CalloutProps {
  /** `notice`: the muted line with the page's gap (`.notice`). `callout`: the tinted box (`.callout`). */
  look: 'notice' | 'callout'
  /** `error` is `.notice--error`, `warning` is `.callout--warning`. */
  tone?: 'default' | 'warning' | 'error'
  /** The element each screen drew: a `<p>` keeps its own margin, a `<div>` holds paragraphs. */
  as?: 'div' | 'p' | 'ul' | 'section'
  /** The bold first line, `.callout__title`. */
  title?: ReactNode
  titleId?: string
  labelledBy?: string
  /** No default: each screen states its own, as it did. */
  role?: 'status' | 'alert'
  testId?: string
  /** Placement classes kept from the screen. */
  className?: string
  /** Takes the focus while truthy, again each time the value changes (pass the outcome), for what replaced the row the
   * author acted on. */
  focusOnShow?: unknown
  /** Given (or with `focusOnShow`): the box is focusable (`tabIndex={-1}`) for its caller to focus. */
  ref?: Ref<HTMLElement>
  children?: ReactNode
}

/**
 * A message box: a notice line or a tinted callout, with a tone, an optional title and the focus
 * when asked. Catalogue: `docs/design/ui-components.md`.
 */
export function Callout({
  look,
  tone = 'default',
  as: Tag = 'div',
  title,
  titleId,
  labelledBy,
  role,
  testId,
  className,
  focusOnShow,
  ref,
  children,
}: CalloutProps) {
  const own = useRef<HTMLElement>(null)
  useImperativeHandle(ref, () => own.current!, [])
  useEffect(() => {
    if (focusOnShow) own.current?.focus()
  }, [focusOnShow])
  const classes = [look, tone === 'default' ? null : `${look}--${tone}`, className]
  return (
    <Tag
      ref={own as Ref<never>}
      className={classes.filter(Boolean).join(' ')}
      role={role}
      tabIndex={focusOnShow !== undefined || ref ? -1 : undefined}
      aria-labelledby={labelledBy}
      data-testid={testId}
    >
      {title !== undefined ? (
        <p className="callout__title" id={titleId}>
          {title}
        </p>
      ) : null}
      {children}
    </Tag>
  )
}
