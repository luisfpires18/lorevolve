import { useEffect, useState } from 'react'
import { Link, Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { CinemaSagas } from '../components/CinemaSagas'
import { ComicCollections } from '../components/ComicCollections'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { listAllProjects } from '../projects/api'
import { formatLabel, kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
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
  rowPath = projectRowPath,
}: {
  inUniverse?: boolean
  /** Only these kinds: the sidebar's Writing, Gaming, Cinema, Comic and Game Entities open this list narrowed (#272). */
  kinds?: readonly ProjectKindValue[]
  /** The sidebar section this list is the page of, which names it. */
  section?: Section
  /** Where a row opens. Game Entities opens a game's directory instead of its project page (#284). */
  rowPath?: (project: ProjectDetail) => string
}) {
  useI18n()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? workspace?.universe.id : undefined
  const requested = universeId ?? 'all'
  const [state, setState] = useState<LoadState | null>(null)
  const [params] = useSearchParams()
  // Sagas and Phases (#289): a second view of the Cinema list, inside one universe.
  const cinema = Boolean(universeId && kinds?.includes(ProjectKind.Film))
  const showSagas = cinema && params.get('view') === 'sagas'
  // Story Arcs and Events (#296): the same second view on the Comic list.
  const comic = Boolean(universeId && kinds?.includes(ProjectKind.Comic))
  const showCollections = comic && params.get('view') === 'arcs'

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

  // One game is no choice: go straight to it. `replace` keeps Back from landing on a picker that would bounce again.
  if (rowPath !== projectRowPath && shown.length === 1) {
    return <Navigate to={rowPath(shown[0])} replace />
  }

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

      {cinema ? (
        <nav
          className="views"
          aria-label={t('projects.sagas.viewsLabel')}
          data-testid="cinema-views"
        >
          <Link
            className="views__link"
            to="?"
            aria-current={showSagas ? undefined : 'page'}
            data-testid="cinema-view-projects"
          >
            {t('projects.sagas.projectsView')}
          </Link>
          <Link
            className="views__link"
            to="?view=sagas"
            aria-current={showSagas ? 'page' : undefined}
            data-testid="cinema-view-sagas"
          >
            {t('projects.sagas.sagasView')}
          </Link>
        </nav>
      ) : null}

      {comic ? (
        <nav
          className="views"
          aria-label={t('projects.comics.viewsLabel')}
          data-testid="comic-views"
        >
          <Link
            className="views__link"
            to="?"
            aria-current={showCollections ? undefined : 'page'}
            data-testid="comic-view-projects"
          >
            {t('projects.comics.projectsView')}
          </Link>
          <Link
            className="views__link"
            to="?view=arcs"
            aria-current={showCollections ? 'page' : undefined}
            data-testid="comic-view-collections"
          >
            {t('projects.comics.collectionsView')}
          </Link>
        </nav>
      ) : null}

      {showSagas && universeId ? (
        <CinemaSagas universeId={universeId} />
      ) : showCollections && universeId ? (
        <ComicCollections universeId={universeId} />
      ) : shown.length === 0 ? (
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
                to={rowPath(project)}
                data-testid={`projects-row-${project.id}`}
              >
                <bdi>{project.name}</bdi>
              </Link>
              <p className="storyrow__meta">
                <span>{kindLabel(project.kind)}</span>
                {project.format ? (
                  <span data-testid="project-row-format">{formatLabel(project.format)}</span>
                ) : null}
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
