import { useId, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'

/**
 * A card that opens a list: an icon in its well, a name, then where it sits, what it is for and how much it holds. The
 * whole card is one link. With `nameOnly` the link is named by the name and described by the rest; without it the link
 * is named by everything it says.
 */
export function CatalogCard({
  href,
  icon,
  name,
  nameOnly = false,
  nameTitle,
  path,
  description,
  meta,
  metaTestId,
  accent,
  testId,
  ...data
}: {
  href: To
  icon: ReactNode
  name: ReactNode
  nameOnly?: boolean
  /** The whole name as a tooltip, where a long one is cut. */
  nameTitle?: string
  path?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  metaTestId?: string
  accent?: string | null
  testId: string
} & { [key: `data-${string}`]: string | undefined }) {
  const nameId = useId()
  const detailsId = useId()
  return (
    <Link
      {...data}
      className="typecard"
      to={href}
      aria-labelledby={nameOnly ? nameId : undefined}
      aria-describedby={nameOnly ? detailsId : undefined}
      style={accent ? { ['--type-accent' as string]: accent } : undefined}
      data-testid={testId}
    >
      <span className="typecard__icon">{icon}</span>
      <span className="typecard__body">
        <span className="typecard__name" id={nameOnly ? nameId : undefined} title={nameTitle}>
          {name}
        </span>
        <span className="typecard__details" id={nameOnly ? detailsId : undefined}>
          {path ? <span className="typecard__path">{path}</span> : null}
          {description ? <span className="typecard__description">{description}</span> : null}
          {meta === undefined || meta === null ? null : (
            <span className="typecard__meta" data-testid={metaTestId}>
              {meta}
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}
