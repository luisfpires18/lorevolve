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
import { ActionMenu } from './ActionMenu'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'

/**
 * The entries a project holds, by type (#144).
 *
 * The type is chosen first, because an entry is of a type and its fields are that type's. Values are edited with the
 * plainest control each kind allows; nothing here infers a meaning from a field's name.
 */
export function ProjectEntries({
  projectId,
  reloadKey,
  onChanged,
}: {
  projectId: string
  reloadKey: number
  /** Called after a write, so the Types panel's entry counts are re-read rather than left stale. */
  onChanged?: () => void
}) {
  useI18n()
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [entries, setEntries] = useState<ProjectEntitySummary[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [adding, setAdding] = useState(false)
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
        onChanged?.()
      })
      .catch(failing)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
  }

  if (types === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
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
        <div className="projects__headtext">
          <h2>{t('projects.entries.title')}</h2>
          <p className="projects__lede">{t('projects.entries.lede')}</p>
        </div>
        <button
          className="button"
          type="button"
          aria-expanded={adding}
          data-testid="project-entry-add"
          onClick={() => setAdding((open) => !open)}
        >
          {t('projects.entries.add')}
        </button>
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

      {/*
       * Asked for rather than always open. Its fields are the chosen type's, so it sits under the type above it and
       * the author reads the type's name before the boxes that belong to it.
       */}
      {adding ? (
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
                setAdding(false)
                refresh()
              })
              .catch(failing)
          }}
        >
          <label className="field">
            <span className="field__label">{t('projects.entries.name')}</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              data-testid="project-entry-new-summary"
            />
          </label>

          {fields.length > 0 ? (
            <h4 className="sectionrule sectionrule--accent">{t('projects.entries.values')}</h4>
          ) : null}

          {fields.map((field) => (
            <ValueField
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
            />
          ))}

          <div className="form__actions">
            <button
              className="button"
              type="submit"
              disabled={busy}
              data-testid="project-entry-new-save"
            >
              {busy ? t('projects.entries.saving') : t('projects.entries.add')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAdding(false)}
              data-testid="project-entry-new-cancel"
            >
              {t('projects.common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {typeId !== null && entries === null ? (
        <p className="projectcard__meta">{t('projects.common.loading')}</p>
      ) : (entries ?? []).length === 0 ? (
        <EmptyState
          title={t('projects.entries.empty')}
          hint={t('projects.entries.emptyHint')}
          testId="project-entries-empty"
        />
      ) : (
        <ul className="projectcardlist" data-testid="project-entry-list">
          {(entries ?? []).map((entry) => (
            <li key={entry.id} className="projectcard" data-testid={`project-entry-${entry.id}`}>
              <div className="projectcard__head">
                <h3 className="projectcard__title">{entry.name}</h3>
                <p className="projectcard__meta">
                  {entry.canonEntityName ?? t('projects.entries.canonNone')}
                </p>
                <div className="projectcard__actions">
                  <ActionMenu
                    label={t('projects.common.more', { name: entry.name })}
                    triggerTestId={`project-entry-actions-${entry.id}`}
                  >
                    <button
                      className="actionmenu__item actionmenu__item--danger"
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
                  </ActionMenu>
                </div>
              </div>
              {entry.summary ? <p className="prose">{entry.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}
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
        <div className="choices">
          {field.options.map((option) => (
            <label key={option.id} className="check">
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
        </div>
      </fieldset>
    )
  }

  if (field.kind === FieldKind.Boolean) {
    return (
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={current.boolean === true}
            data-testid={testId}
            onChange={(event) => onChange({ ...blank, boolean: event.target.checked })}
          />
          <span>
            {field.name}
            {field.isRequired ? ' *' : ''}
          </span>
        </label>
      </div>
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
