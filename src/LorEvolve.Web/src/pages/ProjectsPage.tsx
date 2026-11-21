import { useCallback } from 'react'
import { Section } from '../components/Section'
import { Navigate, useOutletContext } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { listAllProjects } from '../projects/api'
import {
  formatLabel,
  kindLabel,
  lifecycleLabel,
  newProjectPath,
  projectRowPath,
} from '../projects/sections'
import { ProjectKind, type ProjectDetail, type ProjectKindValue } from '../projects/types'
import { t, useI18n } from '../i18n'
import { sectionLabel, type Section as WorkspaceSection } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'
import { NewButton } from '../components/NewButton'
import { ReadGate } from '../components/ReadGate'
import { LinkRow } from '../components/LinkRow'
import { useTitleDetail } from '../lib/useTitleDetail'
import { useAsyncRead } from '../lib/useAsyncRead'

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
  section?: WorkspaceSection
  /** Where a row opens. Game Entities opens a game's directory instead of its project page (#284). */
  rowPath?: (project: ProjectDetail) => string
}) {
  useI18n()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? workspace?.universe.id : undefined

  const heading = section ? sectionLabel(section) : t('projects.list.title')
  // A list that is a section's own page (Game Entities) leads the tab with that section, as its entries lead with the game.
  useTitleDetail(section ? heading : null)

  // Every page, not the first: this screen is where the projects the sidebar leaves out are found (#198). The
  // workspace remounts per universe, so `universeId` is the whole key and a new read never shows another's list.
  const read = useCallback(
    (signal: AbortSignal) => listAllProjects(universeId ? { universeId } : {}, signal),
    [universeId],
  )
  const { load, retry } = useAsyncRead(read)

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
          <NewButton to={newProjectPath(universeId, kinds?.[0])} data-testid="projects-page-new">
            {t('projects.nav.new')}
          </NewButton>
        ) : null
      }
    />
  )

  // The gate draws the loading and the failed line under the head.
  if (load.kind !== 'ready') {
    return (
      <>
        {head}
        <ReadGate
          load={load}
          loading={{ text: t('projects.list.loading') }}
          error={{ message: t('projects.list.failed'), onRetry: retry, testId: 'projects-failed' }}
        >
          {() => null}
        </ReadGate>
      </>
    )
  }

  const shown = kinds ? load.value.filter((project) => kinds.includes(project.kind)) : load.value

  // One game is no choice: go straight to it. `replace` keeps Back from landing on a picker that would bounce again.
  if (rowPath !== projectRowPath && shown.length === 1) {
    return <Navigate to={rowPath(shown[0])} replace />
  }

  return (
    <Section testId="projects-page">
      {/* The head every other workspace screen uses, so Projects reads as one of them (#184). */}
      {head}

      {shown.length === 0 ? (
        <EmptyState
          title={t(kinds ? categoryEmpty(kinds[0]) : 'projects.list.empty')}
          hint={t(kinds ? 'projects.list.emptyCategoryHint' : 'projects.list.emptyHint')}
          testId="projects-empty"
        />
      ) : (
        <ul className="idealist" data-testid="projects-list">
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
    </Section>
  )
}
