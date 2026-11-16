import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ListTree, Pencil, Plus } from 'lucide-react'
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
import { buildTypeTree, typePathLabel } from '../lore/typeTree'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_IMAGE_SHAPE_ORDER,
  FieldImageShape,
  type FieldImageShapeValue,
} from '../lore/types'
import {
  FieldKind,
  type FieldKindValue,
  type ProjectEntityType,
  type ProjectField,
  type ProjectTemplate,
} from '../projectEntities/types'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EmptyState } from './EmptyState'
import { TypeDialog } from './TypeDialog'
import { TypeIcon } from './TypeIcon'
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
  { kind: FieldKind.Image, label: () => t('projects.schema.kind.image') },
]

function kindLabel(kind: FieldKindValue) {
  return KINDS.find((each) => each.kind === kind)?.label() ?? ''
}

/**
 * A project's own types, and the fields on them (#144).
 *
 * The starter types are offered on an empty project and never imposed: the offer says what they would be, and the
 * author may take them or make their own. Once they exist they are ordinary types, which is why edit and delete are
 * right here beside them.
 *
 * Drawn as the universe's Types screen draws its types - the same rows, the same drawer, the same fields panel - because
 * they are the same thing an author manages, only held by a project rather than the universe.
 */
export function ProjectSchema({
  projectId,
  reloadKey,
  onChanged,
  crumb,
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
  /** The way back to the type cards, above the panel's name, when the panel is a screen of its own. */
  crumb?: ReactNode
}) {
  useI18n()
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [template, setTemplate] = useState<ProjectTemplate | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The drawer: a type being edited, or 'new' (from the head, or a row's Add child, which sets `childOf`).
  const [editing, setEditing] = useState<ProjectEntityType | 'new' | null>(null)
  const [childOf, setChildOf] = useState<ProjectEntityType | null>(null)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null)
  const tree = useMemo(() => buildTypeTree(types ?? []), [types])

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
        {crumb ? <div className="pageheader__crumb projects__crumb">{crumb}</div> : null}
        <div className="projects__headtext">
          <h2>{t('projects.schema.title')}</h2>
          <p className="projects__lede">{t('projects.schema.lede')}</p>
        </div>
        <button
          className="button"
          type="button"
          data-testid="project-type-add"
          onClick={() => {
            setChildOf(null)
            setEditing('new')
          }}
        >
          <ActionIcon icon={Plus} />
          {t('entityTypes.page.newType')}
        </button>
      </header>

      {editing ? (
        <TypeDialog
          tree={tree}
          type={editing === 'new' ? null : editing}
          initialParent={editing === 'new' ? childOf : null}
          eyebrow={t('projects.schema.title')}
          iconHint={t('projects.schema.iconHint')}
          parentHint={t('projects.schema.parentHint')}
          write={(values) =>
            editing === 'new'
              ? createProjectType(projectId, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  parentId: values.parentId,
                })
              : // The route replaces the whole type: what the drawer does not edit goes back as it is stored.
                saveProjectType(projectId, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  parentId: values.parentId,
                })
          }
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            refresh()
          }}
        />
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

      <ul className="types__list" data-testid="project-types">
        {tree.ordered.map((node) => {
          const type = node.type
          const parent = node.depth > 0 ? tree.byId.get(node.path[node.path.length - 2]!.id) : null
          return (
            <li
              key={type.id}
              className="types__row"
              data-testid={`project-type-${type.id}`}
              data-type-name={type.name}
              data-depth={node.depth}
              style={{ ['--depth' as string]: Math.min(node.depth, 6) }}
            >
              <div className="types__head">
                <span className="types__icon">
                  <TypeIcon iconKey={type.icon} />
                </span>
                <span className="types__name">
                  <bdi>{type.name}</bdi>
                  {parent ? (
                    <span className="visually-hidden">
                      {t('entityTypes.page.inside', { path: typePathLabel(parent) })}
                    </span>
                  ) : null}
                </span>
                <span className="types__count" data-testid={`project-type-count-${type.id}`}>
                  {type.entryCount === 0
                    ? t('projects.schema.noEntries')
                    : tn('projects.schema.entryCount', type.entryCount)}
                </span>
                <span className="types__actions">
                  {/* Quiet like the universe's; on a phone it waits in the row's menu instead. */}
                  <button
                    className="button button--text button--sm types__addchild"
                    type="button"
                    aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
                    data-testid={`project-type-add-child-${type.id}`}
                    onClick={() => {
                      setChildOf(type)
                      setEditing('new')
                    }}
                  >
                    <ActionIcon icon={ListTree} />
                    {t('entityTypes.page.addChild')}
                  </button>
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    aria-label={t('entityTypes.page.editLabel', { name: type.name })}
                    data-testid={`project-type-edit-${type.id}`}
                    onClick={() => setEditing(type)}
                  >
                    <ActionIcon icon={Pencil} />
                    {t('entityTypes.page.edit')}
                  </button>
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    aria-expanded={openTypeId === type.id}
                    aria-label={t('entityTypes.page.fieldsLabel', { name: type.name })}
                    data-testid={`project-type-fields-open-${type.id}`}
                    onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
                  >
                    {t('entityTypes.page.fields')}
                    {type.fields.length > 0 ? (
                      <span className="types__fieldcount">{type.fields.length}</span>
                    ) : null}
                  </button>
                  <ActionMenu
                    label={t('entityTypes.page.moreActions', { name: type.name })}
                    triggerTestId={`project-type-actions-${type.id}`}
                  >
                    <button
                      className="actionmenu__item types__addchilditem"
                      type="button"
                      onClick={() => {
                        setChildOf(type)
                        setEditing('new')
                      }}
                    >
                      <ActionIcon icon={ListTree} />
                      {t('entityTypes.page.addChildType')}
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
                      {t('entityTypes.page.deleteType')}
                    </button>
                  </ActionMenu>
                </span>
              </div>

              {type.description ? (
                <p className="types__description prose">{type.description}</p>
              ) : null}

              {openTypeId === type.id ? (
                <div className="types__fields" data-testid={`project-type-fields-panel-${type.id}`}>
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
                </div>
              ) : null}
            </li>
          )
        })}
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
    imageShape: FieldImageShapeValue | null
  }) => void
  onCancel: () => void
}) {
  useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FieldKindValue>(FieldKind.ShortText)
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [imageShape, setImageShape] = useState<FieldImageShapeValue>(FieldImageShape.Free)
  const isImage = kind === FieldKind.Image
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
          // A picture is optional by nature: the API refuses a required Image field.
          isRequired: isImage ? false : required,
          imageShape: isImage ? imageShape : null,
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

      {isImage ? (
        <label className="field">
          <span className="field__label">{t('projects.schema.imageShape')}</span>
          <select
            className="field__input"
            value={imageShape}
            onChange={(event) => setImageShape(Number(event.target.value) as FieldImageShapeValue)}
            data-testid="project-field-new-image-shape"
          >
            {FIELD_IMAGE_SHAPE_ORDER.map((each) => (
              <option key={each} value={each}>
                {FIELD_IMAGE_SHAPE_LABELS[each]}
              </option>
            ))}
          </select>
          <span className="field__hint">{t('projects.schema.imageShapeHint')}</span>
        </label>
      ) : (
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
      )}

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
