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
import { ActionMenu } from './ActionMenu'
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
  const [adding, setAdding] = useState(false)
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
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  const offerStarters = types.length === 0 && template !== null && template.types.length > 0

  return (
    <section className="projects" data-testid="project-schema">
      {/* The panel's own primary action sits in its head, where `PageHeader` and the lore screens put one (#184). */}
      <header className="projects__head">
        <div className="projects__headtext">
          <h2>{t('projects.schema.title')}</h2>
          <p className="projects__lede">{t('projects.schema.lede')}</p>
        </div>
        <button
          className="button"
          type="button"
          aria-expanded={adding}
          data-testid="project-type-add"
          onClick={() => setAdding((open) => !open)}
        >
          {t('projects.schema.addType')}
        </button>
      </header>

      {/*
       * Shown when asked for rather than standing open under the list: an empty box with a grey placeholder in it is
       * not a thing an author came to read, and three of them on one screen were what made this page look unfinished.
       */}
      {adding ? (
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
                setAdding(false)
                refresh()
              })
              .catch(failing)
          }}
        >
          <label className="field">
            <span className="field__label">{t('projects.schema.typeName')}</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="project-type-new-name"
              required
            />
          </label>
          <div className="form__actions">
            <button
              className="button"
              type="submit"
              disabled={busy}
              data-testid="project-type-new-save"
            >
              {busy ? t('projects.schema.typeSaving') : t('projects.schema.addType')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAdding(false)}
              data-testid="project-type-new-cancel"
            >
              {t('projects.common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

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
              className="button"
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

      <ul className="projectcardlist" data-testid="project-types">
        {types.map((type) => (
          <li key={type.id} className="projectcard" data-testid={`project-type-${type.id}`}>
            {renaming === type.id ? (
              <form
                className="form projectform--inline"
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
                <button
                  className="button button--sm"
                  type="submit"
                  disabled={busy}
                  data-testid="project-type-rename-save"
                >
                  {t('projects.schema.renameSave')}
                </button>
                {/* A rename the author started and thought better of: without this the only way out of the form was
                    to save it. */}
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  disabled={busy}
                  onClick={() => setRenaming(null)}
                  data-testid="project-type-rename-cancel"
                >
                  {t('projects.common.cancel')}
                </button>
              </form>
            ) : (
              <div className="projectcard__head">
                <h3 className="projectcard__title">{type.name}</h3>
                <p className="projectcard__meta">
                  {type.entryCount === 0
                    ? t('projects.schema.noEntries')
                    : tn('projects.schema.entryCount', type.entryCount)}
                </p>
                {/* A row's secondary and destructive verbs go in the app's one menu for them, as a lore type's row
                    already does, rather than as two outlined pills repeated down the list. */}
                <div className="projectcard__actions">
                  <ActionMenu
                    label={t('projects.common.more', { name: type.name })}
                    triggerTestId={`project-type-actions-${type.id}`}
                  >
                    <button
                      className="actionmenu__item"
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
                      className="actionmenu__item actionmenu__item--danger"
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
                  </ActionMenu>
                </div>
              </div>
            )}

            <h4 className="sectionrule sectionrule--accent">{t('projects.schema.fields')}</h4>
            {type.fields.length === 0 && type.inheritedFields.length === 0 ? (
              <p className="projectcard__meta">{t('projects.schema.noFields')}</p>
            ) : (
              /* The same rows the lore types screen draws for a type's fields, because they are the same thing:
                 what the type above hands down first, quieter, then this type's own. */
              <>
                {type.inheritedFields.length > 0 ? (
                  <div className="fieldlist__inherited">
                    {/* Inherited fields are shown and not editable here: they are defined once, on the type above. */}
                    <ul className="fieldlist">
                      {type.inheritedFields.map((field) => (
                        <li
                          key={field.id}
                          className="fieldlist__row"
                          data-testid={`project-field-inherited-${field.id}`}
                        >
                          <span className="fieldlist__text">
                            <span className="fieldlist__name">{field.name}</span>
                            <span className="fieldlist__meta">{kindLabel(field.kind)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <ul className="fieldlist" data-testid={`project-type-fields-${type.id}`}>
                  {type.fields.map((field) => (
                    <li key={field.id} className="fieldlist__row">
                      <span className="fieldlist__text">
                        <span className="fieldlist__name">{field.name}</span>
                        <span className="fieldlist__meta">{kindLabel(field.kind)}</span>
                      </span>
                      <div className="fieldlist__actions">
                        <ActionMenu
                          label={t('projects.common.more', { name: field.name })}
                          triggerTestId={`project-field-actions-${field.id}`}
                        >
                          <button
                            className="actionmenu__item actionmenu__item--danger"
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
                        </ActionMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
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
                className="button button--text button--sm"
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
            data-testid="project-field-new-options"
          />
        </label>
      ) : null}

      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
            data-testid="project-field-new-required"
          />
          <span>{t('projects.schema.fieldRequired')}</span>
        </label>
      </div>

      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={busy}
          data-testid="project-field-new-save"
        >
          {busy ? t('projects.schema.fieldSaving') : t('projects.schema.addField')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onCancel}
          data-testid="project-field-new-cancel"
        >
          {t('projects.common.cancel')}
        </button>
      </div>
    </form>
  )
}

export type { ProjectField }
