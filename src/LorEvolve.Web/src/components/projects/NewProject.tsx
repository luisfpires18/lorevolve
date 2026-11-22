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
import { Section } from '../Section'
import { errorText } from '../../lib/errorText'
import { useFormSave } from '../../lib/useFormSave'
import { useDiscardGuard } from '../../lib/useDiscardGuard'
import { Callout } from '../Callout'

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
  // `ApiError`'s message is already the refusal in the reader's language (#108); no field is marked.
  const form = useFormSave({
    needChange: null,
    failed: t('projects.new.failed'),
    refusal: (error) => errorText(error, t('projects.new.failed')),
  })
  const saving = form.isSaving
  const failed = form.message
  useDiscardGuard((name !== '' || summary !== '') && !saving, t('projects.new.leave'))

  useDocumentTitle(t('projects.new.title'))

  // A project belongs to exactly one universe (#172), so this screen cannot do its job without one. Reached without a
  // universe, it says so and points at the universes rather than offering a form whose save can only be refused.
  if (!universeId) {
    return (
      <Section>
        <PageHeader title={t('projects.new.title')} />
        <EmptyState
          title={t('projects.new.needsUniverse')}
          hint={t('projects.new.needsUniverseHint')}
          action={<Link to="/app">{t('projects.new.chooseUniverse')}</Link>}
          testId="project-new-needs-universe"
        />
      </Section>
    )
  }

  return (
    <Section testId="project-new">
      <PageHeader title={t('projects.new.title')} />

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          // Navigates while still saving, so the discard guard stays off on the way out.
          void form.save(() =>
            createProject({
              name,
              kind,
              lifecycle: ProjectLifecycle.Planning,
              subtype: null,
              format,
              summary,
              universeId,
              expectedVersion: null,
            }).then((project) => navigate(projectPath(project.id, '', project.universe.id))),
          )
        }}
      >
        <Field
          label={t('projects.new.name')}
          requiredMark
          name={null}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="project-new-name"
          required
        />

        <Field
          as="select"
          label={t('projects.new.kind')}
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
        </Field>

        {pickFormats(kind).length > 0 ? (
          <Field
            as="select"
            label={t('projects.new.format')}
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
          </Field>
        ) : null}

        <Field
          as="textarea"
          label={t('projects.new.summary')}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          data-testid="project-new-summary"
          rows={4}
        />

        {failed ? (
          <Callout look="notice" tone="error" as="p" testId="project-new-error">
            {failed}
          </Callout>
        ) : null}

        <FormActions
          submitLabel={t('projects.new.save')}
          busy={saving}
          busyLabel={t('projects.new.saving')}
          submitTestId="project-new-save"
          inline
        />
      </form>
    </Section>
  )
}
