import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { Field } from '../Field'
import { createProject } from '../../projects/api'
import { formatLabel, formatsFor, kindLabel, projectPath } from '../../projects/sections'
import { ProjectKind, ProjectLifecycle, type ProjectKindValue } from '../../projects/types'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { PageHeader } from '../PageHeader'
import { errorText } from '../../lib/errorText'

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

export function NewProject() {
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
      <PageHeader title={t('projects.new.title')} />

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
              setFailed(errorText(error, t('projects.new.failed')))
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

        <FormActions
          submitLabel={t('projects.new.save')}
          busy={saving}
          busyLabel={t('projects.new.saving')}
          submitTestId="project-new-save"
          inline
        />
      </form>
    </section>
  )
}
