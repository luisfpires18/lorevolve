import type { LiHTMLAttributes, ReactNode } from 'react'
import { TypeIcon } from './TypeIcon'

/**
 * One row of a types list: the head (lead, icon, name with its hidden path, badges, count, then the
 * actions) and the row's body as children. `head` replaces the head, as an inline rename does.
 */
export function TypeRow({
  name,
  icon,
  iconTestId,
  hiddenPath,
  lead,
  badges,
  count,
  countTestId,
  actions,
  head,
  depth,
  testId,
  children,
  style,
  ...li
}: Omit<LiHTMLAttributes<HTMLLIElement>, 'children'> & {
  name: string
  /** The type's icon key; leave it out for a row with no icon. */
  icon?: string | null
  iconTestId?: string
  /** Said after the name to a screen reader only, such as the parent path. */
  hiddenPath?: string
  lead?: ReactNode
  badges?: ReactNode
  count?: ReactNode
  countTestId?: string
  actions?: ReactNode
  head?: ReactNode
  /** Indents a nested type and sets `data-depth`. */
  depth?: number
  testId?: string
  children?: ReactNode
}) {
  return (
    <li
      className="types__row"
      data-testid={testId}
      data-depth={depth}
      style={depth === undefined ? style : { ...style, ['--depth' as string]: Math.min(depth, 6) }}
      {...li}
    >
      {head ?? (
        <div className="types__head">
          {lead}
          {icon !== undefined ? (
            <span className="types__icon" data-testid={iconTestId}>
              <TypeIcon iconKey={icon} />
            </span>
          ) : null}
          <span className="types__name">
            <bdi>{name}</bdi>
            {hiddenPath ? <span className="visually-hidden">{hiddenPath}</span> : null}
          </span>
          {badges}
          {count !== undefined ? (
            <span className="types__count" data-testid={countTestId}>
              {count}
            </span>
          ) : null}
          {actions ? (
            <span className="actions actions--tight types__actions">{actions}</span>
          ) : null}
        </div>
      )}
      {children}
    </li>
  )
}
