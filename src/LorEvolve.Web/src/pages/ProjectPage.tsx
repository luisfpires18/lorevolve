import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ProjectsNav } from '../components/ProjectsNav'
import { createProject, getProject } from '../projects/api'
import { kindLabel, lifecycleLabel, projectPath } from '../projects/sections'
import {
  ProjectKind,
  ProjectLifecycle,
  type ProjectDetail,
  type ProjectKindValue,
} from '../projects/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'

const KINDS: readonly ProjectKindValue[] = [
  ProjectKind.Writing,
  ProjectKind.Game,
  ProjectKind.Series,
  ProjectKind.Film,
  ProjectKind.Comic,
]

/** One project: its own page, or the form that makes one. */
export default function ProjectPage({
  isNew = false,
  inUniverse = false,
}: {
  isNew?: boolean
  /** Inside a universe's workspace, whose sidebar already carries the projects group. */
  inUniverse?: boolean
}) {
  return isNew ? <NewProject /> : <Project inUniverse={inUniverse} />
}

function NewProject() {
  useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const universeId = params.get('universeId')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ProjectKindValue>(ProjectKind.Writing)
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
            summary,
            universeId,
            expectedVersion: null,
          })
            .then((project) => navigate(projectPath(project.id)))
            .catch((error: unknown) => {
              // `ApiError`'s message is already the refusal in the reader's language (#108).
              setFailed(error instanceof Error ? error.message : t('projects.new.failed'))
              setSaving(false)
            })
        }}
      >
        <label className="field">
          <span className="field__label">{t('projects.new.name')}</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.new.namePlaceholder')}
            data-testid="project-new-name"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">{t('projects.new.kind')}</span>
          <select
            className="field__input field__input--select"
            value={kind}
            onChange={(event) => setKind(Number(event.target.value) as ProjectKindValue)}
            data-testid="project-new-kind"
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">{t('projects.new.summary')}</span>
          <textarea
            className="field__input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={t('projects.new.summaryPlaceholder')}
            data-testid="project-new-summary"
            rows={4}
          />
        </label>

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
  | { kind: 'missing'; for: string }
  | { kind: 'failed'; for: string }

function Project({ inUniverse }: { inUniverse: boolean }) {
  useI18n()
  const { projectId } = useParams<{ projectId: string }>()
  const [state, setState] = useState<LoadState | null>(null)
  const read = state !== null && state.for === projectId ? state : null

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    getProject(projectId, controller.signal)
      .then((project) => setState({ kind: 'ready', for: projectId, project }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = (error as { status?: number }).status
        setState(
          status === 404 ? { kind: 'missing', for: projectId } : { kind: 'failed', for: projectId },
        )
      })
    return () => controller.abort()
  }, [projectId])

  useDocumentTitle(read?.kind === 'ready' ? read.project.name : t('projects.one.title'))

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

  const { project } = read

  /*
   * The project's own pages sit beside the list of projects, because this screen is where an author moves between one
   * project and the next. A universe's workspace has the same group in its sidebar; this is the copy for the
   * account-level screens, which have no sidebar of their own.
   */
  return (
    <div className={inUniverse ? undefined : 'projectshell'}>
      {inUniverse ? null : (
        <nav className="projectshell__nav" aria-label={t('projects.list.title')}>
          <ul className="sidebar__nav">
            <ProjectsNav />
          </ul>
        </nav>
      )}

      <section className="projects" data-testid="project-page">
        <header className="projects__head">
          <h1 data-testid="project-name">{project.name}</h1>
          <p className="projects__lede projectmeta" data-testid="project-meta">
            <span>{kindLabel(project.kind)}</span>
            <span>{lifecycleLabel(project.lifecycle)}</span>
            {project.subtype ? <span>{project.subtype}</span> : null}
          </p>
        </header>

        <p data-testid="project-universe">
          {project.universe ? (
            <Link to={`/app/universes/${project.universe.id}`}>{project.universe.name}</Link>
          ) : (
            t('projects.list.noUniverse')
          )}
        </p>

        {project.summary ? (
          <p data-testid="project-summary">{project.summary}</p>
        ) : (
          <p className="projects__lede" data-testid="project-summary-empty">
            {t('projects.one.noSummary')}
          </p>
        )}
      </section>
    </div>
  )
}
