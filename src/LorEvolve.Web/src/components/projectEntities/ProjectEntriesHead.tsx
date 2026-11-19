import type { ReactNode } from 'react'
import type { ProjectEntityType } from '../../projectEntities/types'
import { Crumb, type CrumbItem } from '../Crumb'
import { PageHeader } from '../PageHeader'

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
  crumb?: CrumbItem
  pathname: string
}) {
  return (
    <PageHeader
      level={2}
      size="panel"
      crumb={
        crumb ? (
          <Crumb
            items={[
              crumb,
              ...ancestors.map((ancestor) => ({
                to: `${pathname}?type=${ancestor.id}`,
                label: <bdi>{ancestor.name}</bdi>,
                testId: 'project-entities-path-type',
              })),
            ]}
          />
        ) : undefined
      }
      title={title}
      actions={action}
    />
  )
}
