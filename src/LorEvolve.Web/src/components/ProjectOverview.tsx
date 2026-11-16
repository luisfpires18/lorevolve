import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listProjectTypes } from '../projectEntities/api'
import type { ProjectEntityType } from '../projectEntities/types'
import { projectPath } from '../projects/sections'
import type { ProjectDetail } from '../projects/types'
import { EmptyState } from './EmptyState'
import { t, tn, useI18n } from '../i18n'

/**
 * A project's overview: its identity (the header above, from the page) plus what is in it, as counts per entity type.
 * Each count links to that type's entries. The ways into the project's other views are its tab bar and, for the
 * universe's lore, the sidebar, so nothing here repeats them (#278).
 *
 * One read: the types list already carries `entryCount` from one grouped query, so nothing here counts by fetching
 * entries.
 */
export function ProjectOverview({ project }: { project: ProjectDetail }) {
  useI18n()
  // Every link out of here stays inside the universe the project belongs to (#199).
  const universeId = project.universe.id
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(project.id, controller.signal)
      .then(setTypes)
      .catch(() => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(true)
      })
    return () => controller.abort()
  }, [project.id])

  if (types === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  const entries = types.reduce((total, type) => total + type.entryCount, 0)

  // Nothing of its own yet: say what to do first rather than drawing four empty panels. The types view is where a
  // project starts, because it is what offers the starter templates.
  if (!failed && types.length === 0 && entries === 0) {
    return (
      <EmptyState
        title={t('projects.overview.empty')}
        hint={t('projects.overview.emptyHint')}
        action={
          <Link to={projectPath(project.id, 'entities', universeId)}>
            {t('projects.overview.start')}
          </Link>
        }
        testId="project-overview-empty"
      />
    )
  }

  return (
    <div className="projectbody" data-testid="project-overview">
      {failed ? (
        <p role="alert" data-testid="project-overview-failed">
          {t('projects.overview.failed')}
        </p>
      ) : null}

      <section className="projects" data-testid="project-overview-counts">
        <header className="projects__head">
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.overview.types')}</h2>
            <p className="projects__lede">
              {entries === 0
                ? t('projects.schema.noEntries')
                : tn('projects.schema.entryCount', entries)}
            </p>
          </div>
          <Link
            to={projectPath(project.id, 'entities', universeId)}
            className="button button--secondary"
            data-testid="project-overview-entities"
          >
            {t('projects.sections.entities')}
          </Link>
        </header>

        {types.length === 0 ? (
          <p className="projectcard__meta" data-testid="project-overview-notypes">
            {t('projects.overview.noTypes')}
          </p>
        ) : (
          <ul className="projectcardlist" data-testid="project-overview-type-counts">
            {types.map((type) => (
              <li key={type.id} className="projectcard">
                <Link
                  to={`${projectPath(project.id, 'entities', universeId)}?type=${type.id}`}
                  className="projectcard__head"
                  data-testid={`project-overview-type-${type.id}`}
                >
                  <h3 className="projectcard__title">{type.name}</h3>
                  <p className="projectcard__meta">
                    {type.entryCount === 0
                      ? t('projects.schema.noEntries')
                      : tn('projects.schema.entryCount', type.entryCount)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
