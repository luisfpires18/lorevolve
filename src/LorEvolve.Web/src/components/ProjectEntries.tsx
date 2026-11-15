import { useEffect, useState } from 'react'
import {
  createProjectEntity,
  deleteProjectEntity,
  listProjectEntities,
  listProjectTypes,
} from '../projectEntities/api'
import {
  FieldKind,
  type FieldValueInput,
  type ProjectEntityType,
  type ProjectEntitySummary,
  type ProjectField,
} from '../projectEntities/types'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'

/**
 * The entries a project holds, by type (#144).
 *
 * The type is chosen first, because an entry is of a type and its fields are that type's. Values are edited with the
 * plainest control each kind allows; nothing here infers a meaning from a field's name.
 */
export function ProjectEntries({ projectId, reloadKey }: { projectId: string; reloadKey: number }) {
  useI18n()
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [entries, setEntries] = useState<ProjectEntitySummary[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [values, setValues] = useState<Record<string, FieldValueInput>>({})

  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(projectId, controller.signal)
      .then((read) => {
        setTypes(read)
        setTypeId((current) =>
          current !== null && read.some((type) => type.id === current)
            ? current
            : (read[0]?.id ?? null),
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  useEffect(() => {
    // No type chosen means there is nothing to read: the empty list is derived during render rather than written here,
    // because setting state inside an effect only to say "nothing" starts a second render for no reason.
    if (typeId === null) return

    const controller = new AbortController()
    listProjectEntities(projectId, typeId, controller.signal)
      .then(setEntries)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setEntries([])
        setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
      })
    return () => controller.abort()
  }, [projectId, typeId, reloadKey])

  function refresh() {
    if (typeId === null) return
    listProjectEntities(projectId, typeId)
      .then((read) => {
        setEntries(read)
        setBusy(false)
        setFailed(null)
      })
      .catch(failing)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
  }

  if (types === null) {
    return <p className="projects__lede">{t('projects.entries.loading')}</p>
  }

  if (types.length === 0) {
    return (
      <section className="projects" data-testid="project-entries">
        <h2>{t('projects.entries.title')}</h2>
        <EmptyState
          title={t('projects.entries.needsType')}
          hint={t('projects.entries.needsTypeHint')}
          testId="project-entries-needs-type"
        />
      </section>
    )
  }

  const type = types.find((each) => each.id === typeId) ?? null
  // A type's own fields and the ones it inherits are both filled in on an entry; they differ only in where they are
  // defined, which is the Types screen's business and not this one's.
  const fields: ProjectField[] = type ? [...type.fields, ...type.inheritedFields] : []

  return (
    <section className="projects" data-testid="project-entries">
      <header className="projects__head">
        <h2>{t('projects.entries.title')}</h2>
        <p className="projects__lede">{t('projects.entries.lede')}</p>
      </header>

      {failed ? (
        <p role="alert" data-testid="project-entries-failed">
          {failed}
        </p>
      ) : null}

      <label className="field">
        <span className="field__label">{t('projects.entries.ofType')}</span>
        <select
          className="field__input"
          value={typeId ?? ''}
          onChange={(event) => {
            setTypeId(event.target.value)
            setValues({})
          }}
          data-testid="project-entries-type"
        >
          {types.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>
      </label>

      {typeId !== null && entries === null ? (
        <p className="projects__lede">{t('projects.entries.loading')}</p>
      ) : (entries ?? []).length === 0 ? (
        <EmptyState
          title={t('projects.entries.empty')}
          hint={t('projects.entries.emptyHint')}
          testId="project-entries-empty"
        />
      ) : (
        <ul className="cardlist" data-testid="project-entry-list">
          {(entries ?? []).map((entry) => (
            <li key={entry.id} className="card" data-testid={`project-entry-${entry.id}`}>
              <h3 className="card__title">{entry.name}</h3>
              {entry.summary ? <p>{entry.summary}</p> : null}
              <p className="projects__lede">
                {entry.canonEntityName ?? t('projects.entries.canonNone')}
              </p>
              <button
                type="button"
                disabled={busy}
                data-testid={`project-entry-delete-${entry.id}`}
                onClick={() => {
                  setBusy(true)
                  deleteProjectEntity(projectId, entry.id).then(refresh).catch(failing)
                }}
              >
                {t('projects.entries.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="form"
        data-testid="project-entry-new"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || typeId === null) return
          setBusy(true)
          createProjectEntity(projectId, {
            entityTypeId: typeId,
            name,
            summary: summary.length > 0 ? summary : null,
            canonEntityId: null,
            fields: Object.values(values),
            expectedVersion: null,
          })
            .then(() => {
              setName('')
              setSummary('')
              setValues({})
              refresh()
            })
            .catch(failing)
        }}
      >
        <h3>{t('projects.entries.add')}</h3>

        <label className="field">
          <span className="field__label">{t('projects.entries.name')}</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.entries.namePlaceholder')}
            data-testid="project-entry-new-name"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">{t('projects.entries.summary')}</span>
          <input
            className="field__input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={t('projects.entries.summaryPlaceholder')}
            data-testid="project-entry-new-summary"
          />
        </label>

        {fields.length > 0 ? <h4>{t('projects.entries.values')}</h4> : null}

        {fields.map((field) => (
          <ValueField
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
          />
        ))}

        <button type="submit" disabled={busy} data-testid="project-entry-new-save">
          {busy ? t('projects.entries.saving') : t('projects.entries.save')}
        </button>
      </form>
    </section>
  )
}

/** One field's control, by kind. Every value a save sends fills exactly one member of the input. */
function ValueField({
  field,
  value,
  onChange,
}: {
  field: ProjectField
  value: FieldValueInput | undefined
  onChange: (next: FieldValueInput) => void
}) {
  useI18n()
  const blank: FieldValueInput = {
    fieldDefinitionId: field.id,
    text: null,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
    eraId: null,
  }
  const current = value ?? blank
  const testId = `project-entry-value-${field.id}`

  if (field.kind === FieldKind.Select || field.kind === FieldKind.MultiSelect) {
    const chosen = current.optionIds ?? []
    return (
      <fieldset className="field" data-testid={testId}>
        <legend className="field__label">
          {field.name}
          {field.isRequired ? ' *' : ''}
        </legend>
        {field.options.map((option) => (
          <label key={option.id} className="field field--check">
            <input
              type="checkbox"
              checked={chosen.includes(option.id)}
              data-testid={`${testId}-${option.id}`}
              onChange={(event) =>
                onChange({
                  ...blank,
                  // One choice replaces, several accumulate: the kind decides, not the control.
                  optionIds: event.target.checked
                    ? field.kind === FieldKind.Select
                      ? [option.id]
                      : [...chosen, option.id]
                    : chosen.filter((id) => id !== option.id),
                })
              }
            />
            <span>{option.value}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  if (field.kind === FieldKind.Boolean) {
    return (
      <label className="field field--check">
        <input
          type="checkbox"
          checked={current.boolean === true}
          data-testid={testId}
          onChange={(event) => onChange({ ...blank, boolean: event.target.checked })}
        />
        <span className="field__label">
          {field.name}
          {field.isRequired ? ' *' : ''}
        </span>
      </label>
    )
  }

  return (
    <label className="field">
      <span className="field__label">
        {field.name}
        {field.isRequired ? ' *' : ''}
      </span>
      {field.kind === FieldKind.LongText ? (
        <textarea
          className="field__input"
          value={current.text ?? ''}
          data-testid={testId}
          onChange={(event) => onChange({ ...blank, text: event.target.value })}
        />
      ) : (
        <input
          className="field__input"
          type={
            field.kind === FieldKind.Number
              ? 'number'
              : field.kind === FieldKind.Date
                ? 'date'
                : 'text'
          }
          value={
            field.kind === FieldKind.Number
              ? (current.number?.toString() ?? '')
              : field.kind === FieldKind.Date
                ? (current.date ?? '')
                : (current.text ?? '')
          }
          data-testid={testId}
          onChange={(event) => {
            const raw = event.target.value
            onChange(
              field.kind === FieldKind.Number
                ? { ...blank, number: raw.length > 0 ? Number(raw) : null }
                : field.kind === FieldKind.Date
                  ? { ...blank, date: raw.length > 0 ? raw : null }
                  : { ...blank, text: raw },
            )
          }}
        />
      )}
    </label>
  )
}
