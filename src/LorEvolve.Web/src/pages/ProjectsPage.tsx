import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { listAllProjects } from '../projects/api'
import { kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import { ProjectKind, type ProjectDetail, type ProjectKindValue } from '../projects/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * What was read, and what it was read for. Keeping the request's own key beside the result is what lets the screen say
 * "loading" for a filter it has not read yet without setting state inside the effect: the answer is derived in render
 * from whether the key still matches.
 */
type LoadState =
  { kind: 'ready'; for: string; projects: ProjectDetail[] } | { kind: 'failed'; for: string }

/** The empty wording of a category list, named by its first kind; Series reads as Cinema, like Film. */
function categoryEmpty(kind: ProjectKindValue) {
  if (kind === ProjectKind.Game) return 'projects.list.emptyGame' as const
  if (kind === ProjectKind.Comic) return 'projects.list.emptyComic' as const
  if (kind === ProjectKind.Writing) return 'projects.list.emptyWriting' as const
  return 'projects.list.emptyCinema' as const
}

/**
 * Every project an author can reach, most recently updated first, each inside the universe it belongs to.
 *
 * `inUniverse` is the same screen inside one universe's workspace, narrowed to that universe's projects. Outside it the
 * list is every project of every universe the account can reach, which is all of them: a project belongs to exactly
 * one universe (#172), so there is no filter for projects without one and no way to make one here. New project is
 * offered inside a universe, where the universe it belongs to is already known.
 */
export default function ProjectsPage({
  inUniverse = false,
  kinds,
  section,
}: {
  inUniverse?: boolean
  /** Only these kinds: the sidebar's Writing, Gaming, Cinema, Comic and Game Entities open this list narrowed (#272). */
  kinds?: readonly ProjectKindValue[]
  /** The sidebar section this list is the page of, which names it. */
  section?: Section
}) {
  useI18n()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? workspace?.universe.id : undefined
  const requested = universeId ?? 'all'
  const [state, setState] = useState<LoadState | null>(null)

  const heading = section ? sectionLabel(section) : t('projects.list.title')
  useDocumentTitle(heading)

  useEffect(() => {
    const controller = new AbortController()
    // Every page, not the first: this screen is where the projects the sidebar leaves out are found (#198).
    listAllProjects(universeId ? { universeId } : {}, controller.signal)
      .then((projects) => setState({ kind: 'ready', for: requested, projects }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed', for: requested })
      })
    return () => controller.abort()
  }, [universeId, requested])

  if (state === null || state.for !== requested) {
    return <p className="projects__lede">{t('projects.list.loading')}</p>
  }

  if (state.kind === 'failed') {
    return <EmptyState title={t('projects.list.failed')} testId="projects-failed" />
  }

  const shown = kinds
    ? state.projects.filter((project) => kinds.includes(project.kind))
    : state.projects

  return (
    <section className="projects" data-testid="projects-page">
      {/* The head every other workspace screen uses, so Projects reads as one of them (#184). */}
      <PageHeader
        title={heading}
        lede={t('projects.list.lede')}
        actions={
          /*
           * Only inside a universe: a project belongs to exactly one, so the account-level list has no universe to put
           * a new project in and does not pretend otherwise (#172). The universe's own Projects screen is one click
           * away from any row here.
           */
          universeId ? (
            <Link
              className="button"
              to={`/app/projects/new?universeId=${universeId}${kinds ? `&kind=${kinds[0]}` : ''}`}
              data-testid="projects-page-new"
            >
              {t('projects.nav.new')}
            </Link>
          ) : null
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          title={t(kinds ? categoryEmpty(kinds[0]) : 'projects.list.empty')}
          hint={t(kinds ? 'projects.list.emptyCategoryHint' : 'projects.list.emptyHint')}
          testId="projects-empty"
        />
      ) : (
        <ul className="storylist" data-testid="projects-list">
          {shown.map((project) => (
            <li
              className="storyrow"
              key={project.id}
              data-testid="projects-item"
              data-project-id={project.id}
              data-kind={project.kind}
            >
              <Link
                className="storyrow__title"
                to={projectRowPath(project)}
                data-testid={`projects-row-${project.id}`}
              >
                <bdi>{project.name}</bdi>
              </Link>
              <p className="storyrow__meta">
                <span>{kindLabel(project.kind)}</span>
                <span>{lifecycleLabel(project.lifecycle)}</span>
                {inUniverse ? null : <span>{project.universe.name}</span>}
              </p>
              {project.summary ? (
                <p className="storyrow__premise prose">{project.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
