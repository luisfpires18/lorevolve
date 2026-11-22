import type { ReactNode, Ref } from 'react'

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
