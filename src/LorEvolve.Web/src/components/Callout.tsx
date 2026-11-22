import { useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import type { Outcome } from '../lib/outcome'

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
  /** Buttons or links under the text, in a row (`.callout__actions`). */
  actions?: ReactNode
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
 * A message box: a notice line or a tinted callout, with a tone, an optional title, an optional row of
 * actions and the focus when asked. Catalogue: `docs/design/ui-components.md`.
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
  actions,
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
      {actions ? <div className="actions callout__actions">{actions}</div> : null}
    </Tag>
  )
}

/**
 * A confirmation after a create or delete: a notice holding one status line. Always drawn, so a caller that keeps an
 * empty live region mounted gets one; callers that show it only sometimes keep their own condition.
 */
export function StatusNotice({
  className,
  testId,
  children,
}: {
  className: string
  testId: string
  children?: ReactNode
}) {
  return (
    <Callout look="notice" className={className} testId={testId}>
      <p role="status">{children}</p>
    </Callout>
  )
}

/** What a restore or delete in a list just did, and the way to what it touched. Takes the focus when it shows. */
export function OutcomeNotice({
  outcome,
  className,
  messageTestId,
  linkTestId,
}: {
  outcome: Outcome | null
  className: string
  messageTestId: string
  linkTestId?: string
}) {
  if (!outcome) return null
  return (
    <Callout look="notice" className={className} focusOnShow={outcome}>
      <p role="status" data-testid={messageTestId}>
        {outcome.text}
      </p>
      {outcome.link ? (
        <Link to={outcome.link.to} data-testid={linkTestId}>
          {outcome.link.label}
        </Link>
      ) : null}
    </Callout>
  )
}
