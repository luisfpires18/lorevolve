import { useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { listProjects } from '../projects/api'
import { kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import type { ProjectDetail } from '../projects/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * What was read, and what it was read for. Keeping the request's own key beside the result is what lets the screen say
 * "loading" for a filter it has not read yet without setting state inside the effect: the answer is derived in render
 * from whether the key still matches.
 */
type LoadState =
  { kind: 'ready'; for: string; projects: ProjectDetail[] } | { kind: 'failed'; for: string }

/**
 * Every project an author can reach, most recently updated first.
 *
 * `inUniverse` is the same screen inside one universe's workspace, narrowed to that universe's projects. Outside it the
 * list is everything, projects belonging to no universe included, with a filter for those: a standalone project has to
 * be findable without opening a world, because it may have no world to open.
 */
export default function ProjectsPage({ inUniverse = false }: { inUniverse?: boolean }) {
  useI18n()
  const [params, setParams] = useSearchParams()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? workspace?.universe.id : undefined
  const standalone = !inUniverse && params.get('standalone') === 'true'
  const requested = universeId ?? (standalone ? 'standalone' : 'all')
  const [state, setState] = useState<LoadState | null>(null)

  useDocumentTitle(t('projects.list.title'))

  useEffect(() => {
    const controller = new AbortController()
    listProjects(universeId ? { universeId } : { standalone }, controller.signal)
      .then((projects) => setState({ kind: 'ready', for: requested, projects }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed', for: requested })
      })
    return () => controller.abort()
  }, [universeId, standalone, requested])

  if (state === null || state.for !== requested) {
    return <p className="projects__lede">{t('projects.list.loading')}</p>
  }

  if (state.kind === 'failed') {
    return <EmptyState title={t('projects.list.failed')} testId="projects-failed" />
  }

  return (
    <section className="projects" data-testid="projects-page">
      <header className="projects__head">
        <h1>{t('projects.list.title')}</h1>
        <Link
          className="button"
          to={universeId ? `/app/projects/new?universeId=${universeId}` : '/app/projects/new'}
          data-testid="projects-page-new"
        >
          {t('projects.nav.new')}
        </Link>
      </header>

      {inUniverse ? null : (
        <p className="segmented projects__filters">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!standalone}
            data-testid="projects-filter-all"
            onClick={() => setParams({})}
          >
            {t('projects.list.filterAll')}
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={standalone}
            data-testid="projects-filter-standalone"
            onClick={() => setParams({ standalone: 'true' })}
          >
            {t('projects.list.filterStandalone')}
          </button>
        </p>
      )}

      {state.projects.length === 0 ? (
        <EmptyState
          title={t('projects.list.empty')}
          hint={t('projects.list.emptyHint')}
          testId="projects-empty"
        />
      ) : (
        <ul className="projectlist" data-testid="projects-list">
          {state.projects.map((project) => (
            <li className="projectrow" key={project.id}>
              <Link
                className="projectrow__main"
                to={projectRowPath(project, universeId)}
                data-testid={`projects-row-${project.id}`}
              >
                <span className="projectrow__title">{project.name}</span>
                <span className="projectrow__meta">
                  <span>{kindLabel(project.kind)}</span>
                  <span>{lifecycleLabel(project.lifecycle)}</span>
                </span>
                <span className="projectrow__meta">
                  {project.universe ? project.universe.name : t('projects.list.noUniverse')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
