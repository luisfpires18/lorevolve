import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface ViewLink {
  to: string
  label: ReactNode
  testId?: string
  /** Set (true or false) when the caller knows which one is current: a `Link` with `aria-current`. Left out, the router marks it. */
  current?: boolean
  /** Without `current`: match the path exactly (the first view). */
  end?: boolean
  /** The item's plain name as `data-title`, for a list that is found by name (a manuscript's parts). */
  title?: string
  onClick?: () => void
}

/**
 * The routed views of one object, as links with an underlined current one; `labelledBy` names the links by a heading
 * the caller draws instead of `label`. Catalogue: `docs/design/ui-components.md`.
 */
export function ViewLinks({
  label,
  labelledBy,
  items,
  testId,
  className,
}: {
  label?: string
  labelledBy?: string
  items: ViewLink[]
  testId?: string
  className?: string
}) {
  return (
    <nav
      className={className ? `views ${className}` : 'views'}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      data-testid={testId}
    >
      {items.map((item) =>
        item.current === undefined ? (
          <NavLink
            key={item.to}
            className="views__link"
            to={item.to}
            end={item.end}
            onClick={item.onClick}
            data-testid={item.testId}
            data-title={item.title}
          >
            {item.label}
          </NavLink>
        ) : (
          <Link
            key={item.to}
            className="views__link"
            to={item.to}
            aria-current={item.current ? 'page' : undefined}
            onClick={item.onClick}
            data-testid={item.testId}
            data-title={item.title}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  )
}
