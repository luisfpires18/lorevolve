import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ProjectEntityType } from '../../projectEntities/types'
import { useI18n } from '../../i18n'

/** Lore's head for one type: the path back with the type's ancestors, the type's name, and its action. */
export function ProjectEntriesHead({
  title,
  ancestors = [],
  action,
  crumb,
  pathname,
}: {
  title: ReactNode
  ancestors?: readonly ProjectEntityType[]
  action?: ReactNode
  crumb?: ReactNode
  pathname: string
}) {
  useI18n()

  return (
    <header className="projects__head">
      {crumb ? (
        <div className="pageheader__crumb projects__crumb">
          <span className="lore__path">
            {crumb}
            {ancestors.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <span className="lore__pathsep" aria-hidden="true">
                  ›
                </span>
                <Link
                  to={`${pathname}?type=${ancestor.id}`}
                  data-testid="project-entities-path-type"
                >
                  <bdi>{ancestor.name}</bdi>
                </Link>
              </Fragment>
            ))}
          </span>
        </div>
      ) : null}
      <div className="projects__headtext">
        <h2 className="sectionrule">{title}</h2>
      </div>
      {action}
    </header>
  )
}
