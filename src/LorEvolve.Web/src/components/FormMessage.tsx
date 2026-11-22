import type { ReactNode, Ref, RefObject } from 'react'
import { Callout } from './Callout'

/**
 * The red line under a form: a refused save, a failed load. Renders nothing when there is nothing to say. `role`
 * defaults to `alert` so screen readers announce it; pass `null` where the line has never carried a role.
 */
export function FormMessage({
  children,
  testId,
  id,
  className,
  role = 'alert',
  tabIndex,
  ref,
  as: Tag = 'p',
}: {
  children?: ReactNode
  testId?: string
  id?: string
  /** Extra class for the screen's own spacing, such as `article__failure`. */
  className?: string
  role?: 'alert' | 'status' | null
  /** `-1` where the line takes focus after a refused save. */
  tabIndex?: number
  ref?: Ref<HTMLParagraphElement>
  /** `div` or `ul` where the line holds more than text; the look is the same. */
  as?: 'p' | 'div' | 'ul'
}) {
  if (children === null || children === undefined || children === false || children === '') {
    return null
  }
  return (
    <Tag
      className={['form__message', className].filter(Boolean).join(' ')}
      role={role ?? undefined}
      id={id}
      tabIndex={tabIndex}
      ref={ref as Ref<never>}
      data-testid={testId}
    >
      {children}
    </Tag>
  )
}

/**
 * What an action said: a refused one as the red line, a done one as a status callout. Both take the focus through
 * `line`; nothing is drawn without feedback.
 */
export function FeedbackLine({
  feedback,
  line,
  testId,
}: {
  feedback: { text: string; isError: boolean } | null
  line: RefObject<HTMLParagraphElement | null>
  testId: string
}) {
  if (!feedback) return null
  return feedback.isError ? (
    <FormMessage tabIndex={-1} ref={line} testId={testId}>
      {feedback.text}
    </FormMessage>
  ) : (
    <Callout look="callout" as="p" role="status" ref={line} testId={testId}>
      {feedback.text}
    </Callout>
  )
}
