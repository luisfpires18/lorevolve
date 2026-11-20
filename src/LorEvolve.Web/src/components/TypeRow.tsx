import type { LiHTMLAttributes, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import { TypeIcon } from './TypeIcon'

/**
 * One row of a types list: the head (lead, icon, name with its hidden path, badges, count, then the
 * actions) and the row's body as children. `head` replaces the head, as an inline rename does. `to` makes the name a
 * link, as a film in a saga opens its project.
 */
export function TypeRow({
  name,
  to,
  linkTestId,
  ref,
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
  to?: string
  linkTestId?: string
  /** The row itself, for a caller that reads or reveals it. */
  ref?: Ref<HTMLLIElement>
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
      ref={ref}
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
            {to ? (
              <Link to={to} data-testid={linkTestId}>
                <bdi>{name}</bdi>
              </Link>
            ) : (
              <bdi>{name}</bdi>
            )}
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
