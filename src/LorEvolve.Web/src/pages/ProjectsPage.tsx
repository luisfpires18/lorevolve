import { useEffect, useState } from 'react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { listAllProjects } from '../projects/api'
import { formatLabel, kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import { ProjectKind, type ProjectDetail, type ProjectKindValue } from '../projects/types'
import { t, useI18n } from '../i18n'
import { sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'
import { NewButton } from '../components/NewButton'
import { ReadGate } from '../components/ReadGate'
import { LinkRow } from '../components/LinkRow'
import { useTitleDetail } from '../lib/useTitleDetail'

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
  const [attempt, setAttempt] = useState(0)

  const heading = section ? sectionLabel(section) : t('projects.list.title')
  // A list that is a section's own page (Game Entities) leads the tab with that section, as its entries lead with the game.
  useTitleDetail(section ? heading : null)

  useEffect(() => {
    const controller = new AbortController()
    // Every page, not the first: this screen is where the projects the sidebar leaves out are found (#198).
    listAllProjects(universeId ? { universeId } : {}, controller.signal)
      .then((projects) => setState({ kind: 'ready', for: requested, projects }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed', for: requested })
      })
    return () => controller.abort()
  }, [universeId, requested, attempt])

  // The head is drawn above every state: its title is static, so there is nothing to wait for.
  const head = (
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
          <NewButton
            to={`/app/projects/new?universeId=${universeId}${kinds ? `&kind=${kinds[0]}` : ''}`}
            data-testid="projects-page-new"
          >
            {t('projects.nav.new')}
          </NewButton>
        ) : null
      }
    />
  )

  // A read for another key is still loading here; the gate draws that line and the failed one under the head.
  if (state === null || state.for !== requested || state.kind === 'failed') {
    return (
      <>
        {head}
        <ReadGate
          load={
            state?.for === requested
              ? { kind: 'error', message: t('projects.list.failed') }
              : { kind: 'loading' }
          }
          loading={{ text: t('projects.list.loading') }}
          error={{
            onRetry: () => {
              setState(null)
              setAttempt((current) => current + 1)
            },
            testId: 'projects-failed',
          }}
        >
          {() => null}
        </ReadGate>
      </>
    )
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
      {head}

      {shown.length === 0 ? (
        <EmptyState
          title={t(kinds ? categoryEmpty(kinds[0]) : 'projects.list.empty')}
          hint={t(kinds ? 'projects.list.emptyCategoryHint' : 'projects.list.emptyHint')}
          testId="projects-empty"
        />
      ) : (
        <ul className="storylist" data-testid="projects-list">
          {shown.map((project) => (
            <LinkRow
              look="story"
              key={project.id}
              to={rowPath(project)}
              title={project.name}
              titleTestId={`projects-row-${project.id}`}
              excerpt={project.summary}
              testId="projects-item"
              data-project-id={project.id}
              data-kind={project.kind}
              meta={
                <>
                  <span>{kindLabel(project.kind)}</span>
                  {project.format ? (
                    <span data-testid="project-row-format">{formatLabel(project.format)}</span>
                  ) : null}
                  <span>{lifecycleLabel(project.lifecycle)}</span>
                  {inUniverse ? null : <span>{project.universe.name}</span>}
                </>
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}
