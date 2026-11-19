import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { listAllProjects } from '../projects/api'
import { ProjectKind, type ProjectKindValue } from '../projects/types'
import { t, tn, useI18n } from '../i18n'
import {
  CINEMA,
  COMIC,
  CREATION,
  GAMING,
  WRITING_PROJECTS,
  sectionLabel,
  sectionPurpose,
} from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'
import { NewButton } from '../components/NewButton'
import { LoadError } from '../components/LoadError'
import { CardGrid } from '../components/CardGrid'
import { CatalogCard } from '../components/CatalogCard'

/** The kinds each category lists: the same sets the routes in `App.tsx` give `ProjectsPage`, so a count equals its list. */
const KINDS_BY_SECTION = new Map<string, readonly ProjectKindValue[]>([
  [WRITING_PROJECTS.segment, [ProjectKind.Writing]],
  [GAMING.segment, [ProjectKind.Game]],
  [CINEMA.segment, [ProjectKind.Film, ProjectKind.Series]],
  [COMIC.segment, [ProjectKind.Comic]],
])

type LoadState =
  { kind: 'ready'; for: string; counts: Map<string, number> } | { kind: 'failed'; for: string }

/**
 * Inside a universe, Projects is a directory of the four project families, not the unfiltered list (#275). Every family
 * shows, empty or not: the sidebar hides a family with no project, and this is where an empty one is found.
 */
export default function ProjectsDirectory() {
  useI18n()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = workspace?.universe.id
  const [state, setState] = useState<LoadState | null>(null)
  const [attempt, setAttempt] = useState(0)

  const heading = t('projects.list.title')

  useEffect(() => {
    if (!universeId) return
    const controller = new AbortController()
    listAllProjects({ universeId }, controller.signal)
      .then((projects) => {
        const counts = new Map<string, number>()
        for (const [segment, kinds] of KINDS_BY_SECTION) {
          counts.set(segment, projects.filter((project) => kinds.includes(project.kind)).length)
        }
        setState({ kind: 'ready', for: universeId, counts })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed', for: universeId })
      })
    return () => controller.abort()
  }, [universeId, attempt])

  const current = state !== null && state.for === universeId ? state : null

  return (
    <section className="projects" data-testid="projects-directory">
      <PageHeader
        title={heading}
        lede={t('projects.directory.lede')}
        actions={
          universeId ? (
            <NewButton
              to={`/app/projects/new?universeId=${universeId}`}
              data-testid="projects-page-new"
            >
              {t('projects.nav.new')}
            </NewButton>
          ) : null
        }
      />
      {current?.kind === 'failed' ? (
        <LoadError
          message={t('projects.directory.loadFailed')}
          onRetry={() => {
            setState(null)
            setAttempt((current) => current + 1)
          }}
          testId="projects-failed"
        />
      ) : null}
      <CardGrid rows gap={3} className="lorecatalog__grid" testId="projects-directory-cards">
        {CREATION.map((section) => {
          const Icon = section.icon
          const count =
            current?.kind === 'ready' ? (current.counts.get(section.segment) ?? 0) : null
          return (
            <li key={section.segment}>
              <CatalogCard
                href={`../${section.segment}`}
                icon={<Icon aria-hidden="true" />}
                name={sectionLabel(section)}
                description={sectionPurpose(section)}
                meta={
                  count === null
                    ? null
                    : count === 0
                      ? t('projects.directory.none')
                      : tn('projects.directory.count', count, { n: count })
                }
                metaTestId="projects-directory-count"
                testId="projects-directory-card"
                data-section={section.segment}
              />
            </li>
          )
        })}
      </CardGrid>
    </section>
  )
}
