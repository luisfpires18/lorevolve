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
}

/** The routed views of one object, as links with an underlined current one. Catalogue: `docs/design/ui-components.md`. */
export function ViewLinks({
  label,
  items,
  testId,
  className,
}: {
  label: string
  items: ViewLink[]
  testId?: string
  className?: string
}) {
  return (
    <nav
      className={className ? `views ${className}` : 'views'}
      aria-label={label}
      data-testid={testId}
    >
      {items.map((item) =>
        item.current === undefined ? (
          <NavLink
            key={item.to}
            className="views__link"
            to={item.to}
            end={item.end}
            data-testid={item.testId}
          >
            {item.label}
          </NavLink>
        ) : (
          <Link
            key={item.to}
            className="views__link"
            to={item.to}
            aria-current={item.current ? 'page' : undefined}
            data-testid={item.testId}
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  )
}
