import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listProjectTypes, listProjectEntities } from '../projectEntities/api'
import type { ProjectEntitySummary, ProjectEntityType } from '../projectEntities/types'
import { projectPath, projectSectionLabel, projectSections } from '../projects/sections'
import type { ProjectDetail } from '../projects/types'
import { EmptyState } from './EmptyState'
import { t, tn, useI18n } from '../i18n'

/** How many recently updated entries the overview lists. Enough to show what is being worked on, short enough to read. */
const RECENT = 5

/**
 * A project's overview (#195): what this project is, what is in it, and the way into everything else it has.
 *
 * Two reads, one per list it draws. The counts come from the types list, which already carries `entryCount` from one
 * grouped query, so nothing here counts by fetching entries. The recent entries come from the entries list asking for
 * the newest first, which is the order that endpoint gained for this view. Neither is read per type.
 *
 * Before #195 this route drew the header and an empty state, because #196 moved the schema panel it used to hold into
 * Entities. This is the content that belongs here instead.
 */
export function ProjectOverview({ project }: { project: ProjectDetail }) {
  useI18n()
  // Every link out of here stays inside the universe the project belongs to (#199).
  const universeId = project.universe.id
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [recent, setRecent] = useState<ProjectEntitySummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listProjectTypes(project.id, controller.signal),
      listProjectEntities(project.id, undefined, controller.signal, {
        skip: 0,
        take: RECENT,
        recent: true,
      }),
    ])
      .then(([readTypes, readRecent]) => {
        setTypes(readTypes)
        setRecent(readRecent)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setTypes([])
        setRecent([])
        setFailed(true)
      })
    return () => controller.abort()
  }, [project.id])

  if (types === null || recent === null) {
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

  // Every view this kind offers except the one being read, so the overview is a way into the project rather than a
  // dead end. The list is the same data the tab bar and the sidebar expansion read.
  const ways = projectSections(project.kind).filter((section) => section.segment !== 'overview')

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

      <section className="projects" data-testid="project-overview-recent">
        <header className="projects__head">
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.overview.recent')}</h2>
            <p className="projects__lede">{t('projects.overview.recentLede')}</p>
          </div>
        </header>

        {recent.length === 0 ? (
          <p className="projectcard__meta" data-testid="project-overview-norecent">
            {t('projects.overview.noRecent')}
          </p>
        ) : (
          <ul className="projectcardlist" data-testid="project-overview-recent-list">
            {recent.map((entry) => (
              <li key={entry.id} className="projectcard">
                {/*
                 * The entry itself, named in the address: its type's list opens on its row, reading as many pages as
                 * it takes to reach it. An entry has no screen of its own, so its own row is what opening it means;
                 * a screen that shows an entry's fields is issue #222.
                 */}
                <Link
                  to={`${projectPath(project.id, 'entities', universeId)}?type=${entry.entityTypeId}&entry=${entry.id}`}
                  className="projectcard__head"
                  data-testid={`project-overview-entry-${entry.id}`}
                >
                  <h3 className="projectcard__title">{entry.name}</h3>
                  <p className="projectcard__meta">{entry.entityTypeName}</p>
                </Link>
                {entry.summary ? <p className="prose">{entry.summary}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="projects" data-testid="project-overview-links">
        <header className="projects__head">
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.overview.lore')}</h2>
            <p className="projects__lede">{t('projects.overview.loreLede')}</p>
          </div>
        </header>

        <ul className="projectcardlist" data-testid="project-overview-link-list">
          <li className="projectcard">
            <Link
              to={`/app/universes/${universeId}/lore`}
              className="projectcard__head"
              data-testid="project-overview-lore"
            >
              <h3 className="projectcard__title">{t('projects.overview.loreOf')}</h3>
              <p className="projectcard__meta">{project.universe.name}</p>
            </Link>
          </li>
          {ways.map((section) => (
            <li key={section.segment} className="projectcard">
              <Link
                to={projectPath(project.id, section.segment, universeId)}
                className="projectcard__head"
                data-testid={`project-overview-way-${section.segment}`}
              >
                <h3 className="projectcard__title">{projectSectionLabel(section)}</h3>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
