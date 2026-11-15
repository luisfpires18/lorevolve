import { useEffect, useState } from 'react'
import {
  addProjectField,
  applyProjectTemplate,
  createProjectType,
  deleteProjectField,
  deleteProjectType,
  getProjectTemplate,
  listProjectTypes,
  saveProjectType,
} from '../projectEntities/api'
import {
  FieldKind,
  type FieldKindValue,
  type ProjectEntityType,
  type ProjectField,
  type ProjectTemplate,
} from '../projectEntities/types'
import { EmptyState } from './EmptyState'
import { t, tn, useI18n } from '../i18n'

/** The kinds an author can choose in this screen. EntityReference is not among them: a link field needs a target. */
const KINDS: readonly { kind: FieldKindValue; label: () => string }[] = [
  { kind: FieldKind.ShortText, label: () => t('projects.schema.kind.shortText') },
  { kind: FieldKind.LongText, label: () => t('projects.schema.kind.longText') },
  { kind: FieldKind.Number, label: () => t('projects.schema.kind.number') },
  { kind: FieldKind.Boolean, label: () => t('projects.schema.kind.boolean') },
  { kind: FieldKind.Date, label: () => t('projects.schema.kind.date') },
  { kind: FieldKind.Select, label: () => t('projects.schema.kind.select') },
  { kind: FieldKind.MultiSelect, label: () => t('projects.schema.kind.multiSelect') },
]

function kindLabel(kind: FieldKindValue) {
  return KINDS.find((each) => each.kind === kind)?.label() ?? ''
}

/**
 * A project's own types, and the fields on them (#144).
 *
 * The starter types are offered on an empty project and never imposed: the offer says what they would be, and the
 * author may take them or make their own. Once they exist they are ordinary types, which is why rename and delete are
 * right here beside them.
 */
export function ProjectSchema({
  projectId,
  reloadKey,
  onChanged,
}: {
  projectId: string
  /**
   * Changed by the page when something outside this panel changed what it shows. An entry added beside it is one: a
   * type's entry count is part of this screen, so it has to be re-read rather than left saying "No entries yet" over
   * an entry the author just made.
   */
  reloadKey: number
  /** Called after any write, so the entries panel beside this one re-reads the types it offers. */
  onChanged?: () => void
}) {
  useI18n()
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [template, setTemplate] = useState<ProjectTemplate | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listProjectTypes(projectId, controller.signal),
      getProjectTemplate(projectId, controller.signal),
    ])
      .then(([read, offer]) => {
        setTypes(read)
        setTemplate(offer)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(error instanceof Error ? error.message : t('projects.schema.failed'))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  function after(read: ProjectEntityType[]) {
    setTypes(read)
    setBusy(false)
    setFailed(null)
    onChanged?.()
  }

  function refresh() {
    listProjectTypes(projectId)
      .then(after)
      .catch((error: unknown) => {
        setBusy(false)
        setFailed(error instanceof Error ? error.message : t('projects.schema.failed'))
      })
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.schema.failed'))
  }

  if (types === null) {
    return <p className="projects__lede">{t('projects.schema.loading')}</p>
  }

  const offerStarters = types.length === 0 && template !== null && template.types.length > 0

  return (
    <section className="projects" data-testid="project-schema">
      <header className="projects__head">
        <h2>{t('projects.schema.title')}</h2>
        <p className="projects__lede">{t('projects.schema.lede')}</p>
      </header>

      {failed ? (
        <p role="alert" data-testid="project-schema-failed">
          {failed}
        </p>
      ) : null}

      {offerStarters ? (
        <EmptyState
          title={t('projects.schema.starterOffer', { types: template.types.join(', ') })}
          hint={t('projects.schema.starterHint')}
          action={
            <button
              type="button"
              disabled={busy}
              data-testid="project-schema-starters"
              onClick={() => {
                setBusy(true)
                applyProjectTemplate(projectId).then(after).catch(failing)
              }}
            >
              {busy ? t('projects.schema.starterApplying') : t('projects.schema.starterApply')}
            </button>
          }
          testId="project-schema-offer"
        />
      ) : null}

      {types.length === 0 && !offerStarters ? (
        <EmptyState
          title={t('projects.schema.empty')}
          hint={t('projects.schema.emptyHint')}
          testId="project-schema-empty"
        />
      ) : null}

      <ul className="cardlist" data-testid="project-types">
        {types.map((type) => (
          <li key={type.id} className="card" data-testid={`project-type-${type.id}`}>
            {renaming === type.id ? (
              <form
                className="form form--inline"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (busy) return
                  setBusy(true)
                  saveProjectType(projectId, type.id, {
                    name: renameTo,
                    description: type.description,
                    icon: type.icon,
                    accentColor: type.accentColor,
                    parentId: type.parentId,
                  })
                    .then(() => {
                      setRenaming(null)
                      refresh()
                    })
                    .catch(failing)
                }}
              >
                <label className="field">
                  <span className="field__label">{t('projects.schema.typeName')}</span>
                  <input
                    className="field__input"
                    value={renameTo}
                    onChange={(event) => setRenameTo(event.target.value)}
                    data-testid="project-type-rename-name"
                    required
                  />
                </label>
                <button type="submit" disabled={busy} data-testid="project-type-rename-save">
                  {t('projects.schema.renameSave')}
                </button>
              </form>
            ) : (
              <div className="card__head">
                <h3 className="card__title">{type.name}</h3>
                <p className="projects__lede">
                  {type.entryCount === 0
                    ? t('projects.schema.noEntries')
                    : tn('projects.schema.entryCount', type.entryCount)}
                </p>
                <div className="card__actions">
                  <button
                    type="button"
                    data-testid={`project-type-rename-${type.id}`}
                    onClick={() => {
                      setRenaming(type.id)
                      setRenameTo(type.name)
                    }}
                  >
                    {t('projects.schema.rename')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`project-type-delete-${type.id}`}
                    onClick={() => {
                      setBusy(true)
                      deleteProjectType(projectId, type.id).then(refresh).catch(failing)
                    }}
                  >
                    {t('projects.schema.deleteType')}
                  </button>
                </div>
              </div>
            )}

            <h4>{t('projects.schema.fields')}</h4>
            {type.fields.length === 0 && type.inheritedFields.length === 0 ? (
              <p className="projects__lede">{t('projects.schema.noFields')}</p>
            ) : (
              <ul data-testid={`project-type-fields-${type.id}`}>
                {type.fields.map((field) => (
                  <li key={field.id}>
                    <span>{field.name}</span>{' '}
                    <span className="projects__lede">{kindLabel(field.kind)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      data-testid={`project-field-delete-${field.id}`}
                      onClick={() => {
                        setBusy(true)
                        deleteProjectField(projectId, type.id, field.id)
                          .then(refresh)
                          .catch(failing)
                      }}
                    >
                      {t('projects.schema.deleteField')}
                    </button>
                  </li>
                ))}
                {/* Inherited fields are shown and not editable here: they are defined once, on the type above. */}
                {type.inheritedFields.map((field) => (
                  <li key={field.id} data-testid={`project-field-inherited-${field.id}`}>
                    <span>{field.name}</span>{' '}
                    <span className="projects__lede">{kindLabel(field.kind)}</span>
                  </li>
                ))}
              </ul>
            )}

            {addingFieldTo === type.id ? (
              <FieldForm
                busy={busy}
                onCancel={() => setAddingFieldTo(null)}
                onSubmit={(input) => {
                  setBusy(true)
                  addProjectField(projectId, type.id, input)
                    .then(() => {
                      setAddingFieldTo(null)
                      refresh()
                    })
                    .catch(failing)
                }}
              />
            ) : (
              <button
                type="button"
                data-testid={`project-field-add-${type.id}`}
                onClick={() => setAddingFieldTo(type.id)}
              >
                {t('projects.schema.addField')}
              </button>
            )}
          </li>
        ))}
      </ul>

      <form
        className="form"
        data-testid="project-type-new"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          createProjectType(projectId, {
            name,
            description: null,
            icon: null,
            accentColor: null,
            parentId: null,
          })
            .then(() => {
              setName('')
              refresh()
            })
            .catch(failing)
        }}
      >
        <h3>{t('projects.schema.addType')}</h3>
        <label className="field">
          <span className="field__label">{t('projects.schema.typeName')}</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.schema.typeNamePlaceholder')}
            data-testid="project-type-new-name"
            required
          />
        </label>
        <button type="submit" disabled={busy} data-testid="project-type-new-save">
          {busy ? t('projects.schema.typeSaving') : t('projects.schema.typeSave')}
        </button>
      </form>
    </section>
  )
}

/** The form that adds one field. Choices are asked for only by the two kinds that have them. */
function FieldForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  onSubmit: (input: {
    name: string
    kind: FieldKindValue
    isRequired: boolean | null
    options: string[] | null
  }) => void
  onCancel: () => void
}) {
  useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FieldKindValue>(FieldKind.ShortText)
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const choosing = kind === FieldKind.Select || kind === FieldKind.MultiSelect

  return (
    <form
      className="form"
      data-testid="project-field-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit({
          name,
          kind,
          isRequired: required,
          options: choosing
            ? options
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
            : null,
        })
      }}
    >
      <label className="field">
        <span className="field__label">{t('projects.schema.fieldName')}</span>
        <input
          className="field__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('projects.schema.fieldNamePlaceholder')}
          data-testid="project-field-new-name"
          required
        />
      </label>

      <label className="field">
        <span className="field__label">{t('projects.schema.fieldKind')}</span>
        <select
          className="field__input"
          value={kind}
          onChange={(event) => setKind(Number(event.target.value) as FieldKindValue)}
          data-testid="project-field-new-kind"
        >
          {KINDS.map((each) => (
            <option key={each.kind} value={each.kind}>
              {each.label()}
            </option>
          ))}
        </select>
      </label>

      {choosing ? (
        <label className="field">
          <span className="field__label">{t('projects.schema.fieldOptions')}</span>
          <textarea
            className="field__input"
            value={options}
            onChange={(event) => setOptions(event.target.value)}
            placeholder={t('projects.schema.fieldOptionsPlaceholder')}
            data-testid="project-field-new-options"
          />
        </label>
      ) : null}

      <label className="field field--check">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
          data-testid="project-field-new-required"
        />
        <span className="field__label">{t('projects.schema.fieldRequired')}</span>
      </label>

      <button type="submit" disabled={busy} data-testid="project-field-new-save">
        {busy ? t('projects.schema.fieldSaving') : t('projects.schema.fieldSave')}
      </button>
      <button type="button" onClick={onCancel} data-testid="project-field-new-cancel">
        {t('projects.entries.close')}
      </button>
    </form>
  )
}

export type { ProjectField }
