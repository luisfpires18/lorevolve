import { Fragment, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../i18n'

export interface CrumbItem {
  to: To
  label: ReactNode
  testId?: string
}

/**
 * The way back up, as a named nav: each step a link, a quiet separator between them. One item with `back`
 * is a back link with the arrow. Catalogue: `docs/design/ui-components.md`.
 */
export function Crumb({
  items,
  back,
  testId,
  className,
}: {
  items: CrumbItem[]
  /** The arrow before the one item: a back link rather than a path. */
  back?: boolean
  testId?: string
  className?: string
}) {
  const { t } = useI18n()
  const classes = ['crumb', back && 'crumb--back', className].filter(Boolean).join(' ')
  return (
    <nav className={classes} aria-label={t('shell.crumb.label')} data-testid={testId}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span className="crumb__sep" aria-hidden="true">
              ›
            </span>
          ) : null}
          <Link to={item.to} data-testid={item.testId}>
            {back && index === 0 ? (
              <ArrowLeft aria-hidden="true" focusable="false" strokeWidth={1.75} />
            ) : null}
            {item.label}
          </Link>
        </Fragment>
      ))}
    </nav>
  )
}
