import type { ComponentProps, ReactNode } from 'react'

/**
 * One row of a field list: the field's name and its summary, its buttons when it has any, then whatever follows the row
 * (a blocked or restore note). Every field row draws through this, active, archived or inherited.
 */
export function FieldListRow({
  name,
  meta,
  metaTestId,
  actions,
  testId,
  children,
  ...li
}: Omit<ComponentProps<'li'>, 'className'> & {
  name: string
  meta: ReactNode
  metaTestId?: string
  /** The row's buttons; left out, the row is read-only. */
  actions?: ReactNode
  testId: string
}) {
  return (
    <li {...li} className="fieldlist__row" data-testid={testId}>
      <div className="fieldlist__text">
        <span className="fieldlist__name">
          <bdi>{name}</bdi>
        </span>
        <span className="fieldlist__meta" data-testid={metaTestId}>
          {meta}
        </span>
      </div>
      {actions ? (
        <span className="actions actions--compact fieldlist__actions">{actions}</span>
      ) : null}
      {children}
    </li>
  )
}
