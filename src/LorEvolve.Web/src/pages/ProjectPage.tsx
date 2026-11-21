import { Fragment } from 'react'
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useUniverseAccess } from '../universes/access'
import { ProjectShell } from '../components/ProjectShell'
import StoryPage from './StoryPage'
import type { WorkspaceContext } from './UniverseWorkspace'
import {
  formatLabel,
  formatsFor,
  kindLabel,
  lifecycleLabel,
  projectPath,
  projectSections,
} from '../projects/sections'
import { ProjectKind } from '../projects/types'
import { documentTitle, useWholeTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { useProjectRead } from '../projects/useProjectRead'
import { NewProject } from '../components/projects/NewProject'
import { ProjectBody } from '../components/projects/ProjectBody'
import { LoadError } from '../components/LoadError'
import { ReadGate } from '../components/ReadGate'

/** One project: its own page, or the form that makes one. */
export default function ProjectPage({
  isNew = false,
  inUniverse = false,
  view,
}: {
  isNew?: boolean
  /** Inside a universe's workspace, whose sidebar already carries the projects group. */
  inUniverse?: boolean
  /**
   * The view, when the route names it rather than leaving it to `*`. A Story shown as a Writing Project renders the
   * story's own page, which reads `storyId` and `sceneId` from the address, so those views have routes of their own
   * that carry those names (#194); any other project reached through one of them reads it as that segment.
   */
  view?: 'structure' | 'manuscript'
}) {
  return isNew ? <NewProject /> : <Project inUniverse={inUniverse} view={view} />
}

function Project({ inUniverse, view }: { inUniverse: boolean; view?: string }) {
  useI18n()
  // `id` is the universe in the universe-scoped twin; `*` is whatever the address names below the project. The story
  // view routes name the project `storyId` instead, for the story's page (#194).
  const params = useParams<{
    projectId: string
    storyId: string
    id: string
    '*': string
  }>()
  const projectId = params.projectId ?? params.storyId
  const universeId = params.id
  const segment = view ?? params['*'] ?? ''
  const { search, hash } = useLocation()
  // The universe's workspace, when the route is inside one. The account-level route has none.
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const access = useUniverseAccess()
  const { schemaVersion, setSchemaVersion, read, retry } = useProjectRead({
    projectId,
    inUniverse,
    universeId,
  })

  // Inside a universe its shell names the tab (section and universe); only the account-level page names it here.
  useWholeTitle(
    inUniverse
      ? null
      : documentTitle(read?.kind === 'ready' ? read.project.name : t('projects.one.title')),
  )

  if (read === null || read.kind === 'missing' || read.kind === 'failed') {
    return (
      <ReadGate
        load={
          read === null
            ? { kind: 'loading' }
            : read.kind === 'failed'
              ? { kind: 'error', message: t('projects.one.failed') }
              : read
        }
        loading={{ text: t('projects.one.loading') }}
        error={{ onRetry: retry, testId: 'project-failed' }}
        missing={
          <EmptyState
            title={t('projects.one.missing')}
            hint={t('projects.one.missingHint')}
            action={<Link to="/app/projects">{t('projects.nav.all')}</Link>}
            testId="project-missing"
          />
        }
      >
        {() => null}
      </ReadGate>
    )
  }

  if (read.kind === 'elsewhere') {
    // The universe-scoped routes then serve the story's views, a scene id included, as any other address there does.
    const target = projectPath(read.for, params['*'] ?? '', read.universeId)
    return <Navigate to={`${target}${search}${hash}`} replace />
  }

  if (read.kind === 'story') {
    // A story is only read inside a universe's workspace (the read above needs one), so this never shows.
    if (!workspace)
      return (
        <LoadError message={t('projects.one.failed')} onRetry={retry} testId="project-failed" />
      )
    const storySections = projectSections(ProjectKind.Writing, read.for)
    const storyView = storySections.find((candidate) => candidate.segment === segment)
    // Reached through `*` (the bare address, or a view a story does not have) or by a segment the story routes do not
    // carry, the story-backed project lands on its Structure, which is the story's own first view.
    if (!storyView || !view) {
      return <Navigate to={projectPath(read.for, 'structure', workspace.universe.id)} replace />
    }
    // The story's page, unchanged, with its own header and views; the shell only adds the project's tab bar above it.
    return (
      <ProjectShell
        projectId={read.for}
        projectName={read.title}
        universe={workspace.universe}
        sections={storySections}
      >
        <StoryPage view={view === 'manuscript' ? 'manuscript' : 'scenes'} />
      </ProjectShell>
    )
  }

  const { project } = read
  const sections = projectSections(project.kind)
  // `entities/<entryId>` is one entry's own screen (#286) inside the project; no other view has a sub-address.
  const [head, entryId, ...beyond] = segment.split('/')
  const section =
    beyond.length === 0 && (entryId === undefined || (head === 'entities' && entryId !== ''))
      ? sections.find((candidate) => candidate.segment === head)
      : undefined

  /*
   * One address per view (#199): `/app/universes/<universeId>/projects/<id>/<view>`, inside the universe the project
   * belongs to. The account-level address, a universe the project is not in, the bare address and any segment this
   * kind does not offer all land there, keeping the query and the hash, so an old or mistyped link opens the project
   * rather than a failure (#192). `/overview` is a retired view (#377): it lands on the kind's first view the same way.
   */
  if (!inUniverse || universeId !== project.universe.id || !section) {
    const target = projectPath(
      project.id,
      section ? segment : sections[0].segment,
      project.universe.id,
    )
    return <Navigate to={`${target}${search}${hash}`} replace />
  }

  /*
   * One column, one rhythm. The panels used to be the grid children of the shell beside the nav, which auto-placed
   * Types and Entries into two columns of unequal weight and dropped the structure panel full width underneath. They
   * are the same kind of thing and now read as one stack, separated by a rule, at every width (#184).
   */
  const entitiesPath = projectPath(project.id, 'entities', project.universe.id)
  // The facts, one dot between each, joined here: a separator is not a message anyone translates.
  const facts = [
    <span key="kind">{kindLabel(project.kind)}</span>,
    project.format ? (
      <span key="format" data-testid="project-format">
        {formatLabel(project.format)}
      </span>
    ) : formatsFor(project.kind).length > 0 ? (
      <span key="format" data-testid="project-format">
        {t('projects.format.unset')}
      </span>
    ) : null,
    <span key="lifecycle">{lifecycleLabel(project.lifecycle)}</span>,
    project.subtype ? <span key="subtype">{project.subtype}</span> : null,
  ].filter(Boolean)
  const meta = (
    <span data-testid="project-meta">
      {facts.map((fact, index) => (
        <Fragment key={index}>
          {index === 0 ? null : ' · '}
          {fact}
        </Fragment>
      ))}
    </span>
  )
  const typesPath = sections.some((candidate) => candidate.segment === 'types')
    ? projectPath(project.id, 'types', project.universe.id)
    : undefined
  return (
    <ProjectShell
      projectId={project.id}
      projectName={project.name}
      universe={project.universe}
      sections={sections}
      facts={{
        lede: meta,
        summary: project.summary ? (
          <p className="prose" data-testid="project-summary">
            {project.summary}
          </p>
        ) : null,
      }}
    >
      <ProjectBody
        project={project}
        section={section}
        entryId={entryId}
        entitiesPath={entitiesPath}
        typesPath={typesPath}
        access={access}
        schemaVersion={schemaVersion}
        setSchemaVersion={setSchemaVersion}
      />
    </ProjectShell>
  )
}
