import { useEffect, useState } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { ComicCollections } from '../components/ComicCollections'
import { EmptyState } from '../components/EmptyState'
import { Field } from '../components/Field'
import { PageHeader } from '../components/PageHeader'
import { ProjectEntitiesView } from '../components/ProjectEntitiesView'
import { ProjectSchema } from '../components/ProjectSchema'
import { useUniverseAccess } from '../universes/access'
import { ProjectEntityDetailView } from '../components/ProjectEntityDetailView'
import { ProjectOverview } from '../components/ProjectOverview'
import { ProjectOutline } from '../components/ProjectOutline'
import { ProjectSeasons } from '../components/ProjectSeasons'
import { ProjectShell } from '../components/ProjectShell'
import { createProject, getProject, listProjects } from '../projects/api'
import { getStory } from '../stories/api'
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
import {
  ProjectKind,
  ProjectLifecycle,
  type ProjectDetail,
  type ProjectKindValue,
} from '../projects/types'
import { documentTitle, useDocumentTitle, useWholeTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'

/** A `kind` query value only when it names a real kind; the category lists pass theirs (#276). */
function kindFromParam(raw: string | null): ProjectKindValue {
  const kind = Number(raw)
  return raw !== null && KINDS.includes(kind as ProjectKindValue)
    ? (kind as ProjectKindValue)
    : ProjectKind.Writing
}

const KINDS: readonly ProjectKindValue[] = [
  ProjectKind.Writing,
  ProjectKind.Game,
  ProjectKind.Series,
  ProjectKind.Film,
  ProjectKind.Comic,
]

/** The kinds the form offers (owner, 2026-11-17): Film and Series are one choice, Cinema, told apart by the format. */
const PICKED: readonly ProjectKindValue[] = [
  ProjectKind.Writing,
  ProjectKind.Game,
  ProjectKind.Film,
  ProjectKind.Comic,
]

const isCinema = (kind: ProjectKindValue) =>
  kind === ProjectKind.Film || kind === ProjectKind.Series

/** A kind's formats; Cinema's are the film formats then the series formats, and the one picked sets the kind. */
function pickFormats(kind: ProjectKindValue) {
  return isCinema(kind)
    ? [...formatsFor(ProjectKind.Film), ...formatsFor(ProjectKind.Series)]
    : formatsFor(kind)
}

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

function NewProject() {
  useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const universeId = params.get('universeId')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProjectKindValue>(kindFromParam(params.get('kind')))
  const [format, setFormat] = useState<string | null>(
    () => formatsFor(kindFromParam(params.get('kind')))[0]?.id ?? null,
  )
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useDocumentTitle(t('projects.new.title'))

  // A project belongs to exactly one universe (#172), so this screen cannot do its job without one. Reached without a
  // universe, it says so and points at the universes rather than offering a form whose save can only be refused.
  if (!universeId) {
    return (
      <EmptyState
        title={t('projects.new.needsUniverse')}
        hint={t('projects.new.needsUniverseHint')}
        action={<Link to="/app">{t('projects.new.chooseUniverse')}</Link>}
        testId="project-new-needs-universe"
      />
    )
  }

  return (
    <section className="projects" data-testid="project-new">
      <h1>{t('projects.new.title')}</h1>

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          if (saving) return
          setSaving(true)
          setFailed(null)
          createProject({
            name,
            kind,
            lifecycle: ProjectLifecycle.Planning,
            subtype: null,
            format,
            summary,
            universeId,
            expectedVersion: null,
          })
            .then((project) => navigate(projectPath(project.id, '', project.universe.id)))
            .catch((error: unknown) => {
              // `ApiError`'s message is already the refusal in the reader's language (#108).
              setFailed(error instanceof Error ? error.message : t('projects.new.failed'))
              setSaving(false)
            })
        }}
      >
        <Field label={t('projects.new.name')}>
          {(control) => (
            <input
              {...control}
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="project-new-name"
              required
            />
          )}
        </Field>

        <Field label={t('projects.new.kind')}>
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={isCinema(kind) ? ProjectKind.Film : kind}
              onChange={(event) => {
                const next = Number(event.target.value) as ProjectKindValue
                setKind(next)
                setFormat(formatsFor(next)[0]?.id ?? null)
              }}
              data-testid="project-new-kind"
            >
              {PICKED.map((value) => (
                <option key={value} value={value}>
                  {value === ProjectKind.Film ? t('projects.new.cinema') : kindLabel(value)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {pickFormats(kind).length > 0 ? (
          <Field label={t('projects.new.format')}>
            {(control) => (
              <select
                {...control}
                className="field__input field__input--select"
                value={format ?? ''}
                onChange={(event) => {
                  const picked = pickFormats(kind).find((one) => one.id === event.target.value)
                  setFormat(event.target.value)
                  if (picked && isCinema(kind)) setKind(picked.kind as ProjectKindValue)
                }}
                data-testid="project-new-format"
              >
                {pickFormats(kind).map((option) => (
                  <option key={option.id} value={option.id}>
                    {formatLabel(option.id)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}

        <Field label={t('projects.new.summary')}>
          {(control) => (
            <textarea
              {...control}
              className="field__input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              data-testid="project-new-summary"
              rows={4}
            />
          )}
        </Field>

        {failed ? (
          <p className="notice notice--error" data-testid="project-new-error">
            {failed}
          </p>
        ) : null}

        <div className="form__actions">
          <button className="button" type="submit" disabled={saving} data-testid="project-new-save">
            {saving ? t('projects.new.saving') : t('projects.new.save')}
          </button>
        </div>
      </form>
    </section>
  )
}

/** The project that was read, and the id it was read for; see `ProjectsPage` for why the key is kept. */
type LoadState =
  | { kind: 'ready'; for: string; project: ProjectDetail }
  /** A Story shown as a Writing Project (#140): read as the story, because no project row exists for it. */
  | { kind: 'story'; for: string; title: string }
  /** A story reached at the account-level address, which carries no universe: where it belongs (#199). */
  | { kind: 'elsewhere'; for: string; universeId: string }
  | { kind: 'missing'; for: string }
  | { kind: 'failed'; for: string }

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
  const [state, setState] = useState<LoadState | null>(null)
  const [schemaVersion, setSchemaVersion] = useState(0)
  const read = state !== null && state.for === projectId ? state : null

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    getProject(projectId, controller.signal)
      .then((project) => setState({ kind: 'ready', for: projectId, project }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = (error as { status?: number }).status
        if (status !== 404) {
          setState({ kind: 'failed', for: projectId })
          return
        }
        // `/api/projects/{id}` does not resolve a story id, by design (#140), so a project that is not stored may be a
        // story of this universe. Only read here, never copied: the story's page reads the story itself.
        if (!inUniverse || !universeId) {
          // The account-level address names no universe, so the story's is read from the projects list, which carries
          // story-backed rows with their universe and keeps the one named by `include` (#198).
          listProjects({ limit: 1, include: projectId }, controller.signal)
            .then((rows) => {
              const row = rows.find((candidate) => candidate.id === projectId)
              setState(
                row
                  ? { kind: 'elsewhere', for: projectId, universeId: row.universe.id }
                  : { kind: 'missing', for: projectId },
              )
            })
            .catch(() => {
              if (!controller.signal.aborted) setState({ kind: 'failed', for: projectId })
            })
          return
        }
        getStory(universeId, projectId, controller.signal)
          .then((story) => setState({ kind: 'story', for: projectId, title: story.title }))
          .catch((storyError: unknown) => {
            if (controller.signal.aborted) return
            const storyStatus = (storyError as { status?: number }).status
            setState(
              storyStatus === 404
                ? { kind: 'missing', for: projectId }
                : { kind: 'failed', for: projectId },
            )
          })
      })
    return () => controller.abort()
  }, [projectId, inUniverse, universeId])

  // Inside a universe its shell names the tab (section and universe); only the account-level page names it here.
  useWholeTitle(
    inUniverse
      ? null
      : documentTitle(read?.kind === 'ready' ? read.project.name : t('projects.one.title')),
  )

  if (read === null) {
    return <p className="projects__lede">{t('projects.one.loading')}</p>
  }

  if (read.kind === 'missing') {
    return (
      <EmptyState
        title={t('projects.one.missing')}
        hint={t('projects.one.missingHint')}
        action={<Link to="/app/projects">{t('projects.nav.all')}</Link>}
        testId="project-missing"
      />
    )
  }

  if (read.kind === 'failed') {
    return <EmptyState title={t('projects.one.failed')} testId="project-failed" />
  }

  if (read.kind === 'elsewhere') {
    // The universe-scoped routes then serve the story's views, a scene id included, as any other address there does.
    const target = projectPath(read.for, params['*'] ?? '', read.universeId)
    return <Navigate to={`${target}${search}${hash}`} replace />
  }

  if (read.kind === 'story') {
    // A story is only read inside a universe's workspace (the read above needs one), so this never shows.
    if (!workspace) return <EmptyState title={t('projects.one.failed')} testId="project-failed" />
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
        story
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
   * rather than a failure (#192).
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
  const meta = (
    <span className="projectmeta" data-testid="project-meta">
      <span>{kindLabel(project.kind)}</span>
      {project.format ? (
        <span data-testid="project-format">{formatLabel(project.format)}</span>
      ) : formatsFor(project.kind).length > 0 ? (
        <span data-testid="project-format">{t('projects.format.unset')}</span>
      ) : null}
      <span>{lifecycleLabel(project.lifecycle)}</span>
      {project.subtype ? <span>{project.subtype}</span> : null}
    </span>
  )
  // A kind with no Overview (a Game, owner 2026-11-17) opens on its content; its facts and summary sit above the tabs.
  const compact = !sections.some((candidate) => candidate.segment === 'overview')
  const typesPath = sections.some((candidate) => candidate.segment === 'types')
    ? projectPath(project.id, 'types', project.universe.id)
    : undefined
  const body = entryId ? (
    <div className="projectbody">
      <ProjectEntityDetailView
        key={entryId}
        projectId={project.id}
        universeId={project.universe.id}
        entityId={entryId}
        gameName={project.name}
        gameHref={entitiesPath}
      />
    </div>
  ) : (
    <div className="projectbody">
      {compact ? null : (
        <section className="projects" data-testid="project-page">
          {/*
           * The head every other workspace screen uses (#184): the project's facts as the lede, and the summary under it
           * as the project's own words. The universe is named by the shell's breadcrumb above the tabs (#199).
           */}
          <PageHeader title={project.name} titleTestId="project-name" lede={meta} />

          {project.summary ? (
            <p className="prose" data-testid="project-summary">
              {project.summary}
            </p>
          ) : (
            <p className="projectcard__meta" data-testid="project-summary-empty">
              {t('projects.one.noSummary')}
            </p>
          )}
        </section>
      )}

      {/*
       * One panel per view (#193). The overview holds the project's own content, its counts and the ways into the rest
       * of it (#195), Entities the type cards, a type's entries and the type editor behind an action (#196), and
       * Structure the structure. A view with no panel of its own yet says so rather than borrowing one.
       *
       * A schema write changes what the entries can offer - a new type is a type an entry can be of - so the editor and
       * the entries still share `schemaVersion`. It lives here, in the component that stays mounted while the author
       * moves between this project's views and between the Entities view's own screens.
       */}
      {section.segment === 'overview' ? (
        <ProjectOverview project={project} />
      ) : section.segment === 'entities' ? (
        <ProjectEntitiesView
          projectId={project.id}
          universeId={project.universe.id}
          reloadKey={schemaVersion}
          entryHref={(entry) => `${entitiesPath}/${entry.id}`}
          typesHref={typesPath}
          onChanged={() => setSchemaVersion((version) => version + 1)}
        />
      ) : section.segment === 'types' ? (
        // The type editor, the same `ProjectSchema` Entities used to open behind "Manage types".
        <ProjectSchema
          asPage
          projectName={project.name}
          universeId={project.universe.id}
          canEdit={access.editContent}
          projectId={project.id}
          reloadKey={schemaVersion}
          onChanged={() => setSchemaVersion((version) => version + 1)}
        />
      ) : section.segment === 'structure' &&
        /*
         * One structure under three names: a Series' seasons of episodes (#145), a Film's sequences of scenes (#146)
         * and a Comic's volumes of chapters (#147), the last of which opens pages and panels beneath a chapter. The API
         * answers 404 for any other kind, so drawing the panel there would show an author a failure for a feature their
         * project does not have.
         */
        (project.kind === ProjectKind.Series ||
          project.kind === ProjectKind.Film ||
          project.kind === ProjectKind.Comic) ? (
        /*
         * A project whose format has structure rules (#290) gets the outline; the outline draws this legacy panel itself
         * when the tree read answers 404 (no format, or one without rules yet), and under "Earlier structure" while
         * legacy rows exist.
         */
        <>
          <ProjectOutline
            key={`${project.id}-${project.format ?? ''}`}
            projectId={project.id}
            legacy={
              <ProjectSeasons
                projectId={project.id}
                universeId={project.universe.id}
                words={
                  project.kind === ProjectKind.Film
                    ? 'sequences'
                    : project.kind === ProjectKind.Comic
                      ? 'volumes'
                      : 'seasons'
                }
                pages={project.kind === ProjectKind.Comic}
              />
            }
          />
          {/* A Comic's Volumes (#297) collect its issues or chapters by reference, under the outline. */}
          {project.kind === ProjectKind.Comic ? (
            <ComicCollections universeId={project.universe.id} projectId={project.id} />
          ) : null}
        </>
      ) : (
        <EmptyState
          title={t('projects.view.empty')}
          hint={t('projects.view.emptyHint')}
          testId={`project-view-empty-${section.segment}`}
        />
      )}
    </div>
  )

  return (
    <ProjectShell
      projectId={project.id}
      projectName={project.name}
      universe={project.universe}
      sections={sections}
      facts={
        compact
          ? {
              lede: meta,
              summary: project.summary ? (
                <p className="prose" data-testid="project-summary">
                  {project.summary}
                </p>
              ) : null,
            }
          : undefined
      }
    >
      {body}
    </ProjectShell>
  )
}
