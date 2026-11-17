import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import {
  addTemplateField,
  createTypeTemplate,
  deleteTemplateField,
  deleteTypeTemplate,
  listTypeTemplates,
  saveTemplateField,
  saveTypeTemplate,
} from '../typeTemplates/api'
import type { TypeTemplate } from '../typeTemplates/types'
import type { ProjectField } from '../projectEntities/types'
import { buildTypeTree, type TreeType } from '../lore/typeTree'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EmptyState } from './EmptyState'
import { FieldForm, kindLabel } from './ProjectSchema'
import { TypeDialog } from './TypeDialog'
import { TypeIcon } from './TypeIcon'
import { t, useI18n } from '../i18n'

const NO_TYPES = buildTypeTree<TreeType>([])

/**
 * The universe's reusable types (#282). A template is its own thing: editing or deleting one never touches the types
 * of any game, because a game only ever gets a copy. The rows are the Types screen's own rows and the fields panel is
 * the project fields panel, so a template reads like a type and is managed like one.
 */
export function TypeTemplates({ universeId, canEdit }: { universeId: string; canEdit: boolean }) {
  useI18n()
  const [templates, setTemplates] = useState<TypeTemplate[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<TypeTemplate | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // A field form is open on a template: new, or an existing field being edited.
  const [fieldForm, setFieldForm] = useState<{
    templateId: string
    field: ProjectField | null
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listTypeTemplates(universeId, controller.signal)
      .then(setTemplates)
      .catch(() => {
        if (controller.signal.aborted) return
        setTemplates([])
        setFailed(t('entityTypes.page.templates.loadFailed'))
      })
    return () => controller.abort()
  }, [universeId])

  function refresh() {
    listTypeTemplates(universeId)
      .then((read) => {
        setTemplates(read)
        setFailed(null)
      })
      .catch(() => setFailed(t('entityTypes.page.templates.loadFailed')))
      .finally(() => setBusy(false))
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(
      error instanceof ApiError ? error.message : t('entityTypes.page.templates.actionFailed'),
    )
  }

  async function remove(template: TypeTemplate) {
    const confirmed = await confirmAction({
      title: t('entityTypes.page.templates.deleteTitle'),
      message: t('entityTypes.page.templates.deleteMessage'),
      confirmLabel: t('entityTypes.page.templates.deleteConfirm'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    deleteTypeTemplate(universeId, template.id).then(refresh).catch(failing)
  }

  if (templates === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  return (
    <section className="projects" data-testid="type-templates">
      {canEdit ? (
        <div className="types__context">
          <button
            className="button"
            type="button"
            data-testid="template-new"
            onClick={() => setEditing('new')}
          >
            <ActionIcon icon={Plus} />
            {t('entityTypes.page.templates.new')}
          </button>
        </div>
      ) : null}

      {editing ? (
        <TypeDialog
          tree={NO_TYPES}
          type={editing === 'new' ? null : { ...editing, parentId: null, displayOrder: 0 }}
          noParent
          eyebrow={t('entityTypes.page.templates.eyebrow')}
          nameHint={t('entityTypes.page.templates.nameHint')}
          write={(values) =>
            editing === 'new'
              ? createTypeTemplate(universeId, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  parentId: null,
                })
              : // The route replaces the whole template: what the drawer does not edit goes back as stored.
                saveTypeTemplate(universeId, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  parentId: null,
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
        <p className="notice notice--error" role="alert" data-testid="type-templates-failed">
          {failed}
        </p>
      ) : null}

      {templates.length === 0 && !failed ? (
        <EmptyState
          title={t('entityTypes.page.templates.empty')}
          hint={t(
            canEdit
              ? 'entityTypes.page.templates.emptyHint'
              : 'entityTypes.page.templates.emptyHintViewer',
          )}
          testId="type-templates-empty"
        />
      ) : null}

      <ul className="types__list" data-testid="template-list">
        {templates.map((template) => (
          <li
            key={template.id}
            className="types__row"
            data-testid={`template-${template.id}`}
            data-template-name={template.name}
          >
            <div className="types__head">
              <span className="types__icon">
                <TypeIcon iconKey={template.icon} />
              </span>
              <span className="types__name">
                <bdi>{template.name}</bdi>
              </span>
              <span className="chip">{t('entityTypes.page.templates.chip')}</span>
              <span className="types__actions">
                {canEdit ? (
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    aria-label={t('entityTypes.page.editLabel', { name: template.name })}
                    data-testid={`template-edit-${template.id}`}
                    onClick={() => setEditing(template)}
                  >
                    <ActionIcon icon={Pencil} />
                    {t('entityTypes.page.edit')}
                  </button>
                ) : null}
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  aria-expanded={openId === template.id}
                  aria-label={t('entityTypes.page.fieldsLabel', { name: template.name })}
                  data-testid={`template-fields-open-${template.id}`}
                  onClick={() => setOpenId(openId === template.id ? null : template.id)}
                >
                  {t('entityTypes.page.fields')}
                  {template.fields.length > 0 ? (
                    <span className="types__fieldcount">{template.fields.length}</span>
                  ) : null}
                </button>
                {canEdit ? (
                  <ActionMenu
                    label={t('entityTypes.page.moreActions', { name: template.name })}
                    triggerTestId={`template-actions-${template.id}`}
                  >
                    <button
                      className="actionmenu__item actionmenu__item--danger"
                      type="button"
                      disabled={busy}
                      data-testid={`template-delete-${template.id}`}
                      onClick={() => void remove(template)}
                    >
                      {t('entityTypes.page.templates.delete')}
                    </button>
                  </ActionMenu>
                ) : null}
              </span>
            </div>

            {openId === template.id ? (
              <div className="types__fields" data-testid={`template-fields-panel-${template.id}`}>
                {template.fields.length === 0 ? (
                  <p className="projectcard__meta">{t('projects.schema.noFields')}</p>
                ) : (
                  <ul className="fieldlist" data-testid={`template-fields-${template.id}`}>
                    {template.fields.map((field) => (
                      <li key={field.id} className="fieldlist__row">
                        <span className="fieldlist__text">
                          <span className="fieldlist__name">{field.name}</span>
                          <span className="fieldlist__meta">{kindLabel(field.kind)}</span>
                        </span>
                        {canEdit ? (
                          <div className="fieldlist__actions">
                            <ActionMenu
                              label={t('projects.common.more', { name: field.name })}
                              triggerTestId={`template-field-actions-${field.id}`}
                            >
                              <button
                                className="actionmenu__item"
                                type="button"
                                data-testid={`template-field-edit-${field.id}`}
                                onClick={() => setFieldForm({ templateId: template.id, field })}
                              >
                                {t('entityTypes.page.templates.editField')}
                              </button>
                              <button
                                className="actionmenu__item actionmenu__item--danger"
                                type="button"
                                disabled={busy}
                                data-testid={`template-field-delete-${field.id}`}
                                onClick={() => {
                                  setBusy(true)
                                  deleteTemplateField(universeId, template.id, field.id)
                                    .then(refresh)
                                    .catch(failing)
                                }}
                              >
                                {t('projects.schema.deleteField')}
                              </button>
                            </ActionMenu>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {canEdit && fieldForm?.templateId === template.id ? (
                  <FieldForm
                    key={fieldForm.field?.id ?? 'new'}
                    busy={busy}
                    initial={fieldForm.field ?? undefined}
                    onCancel={() => setFieldForm(null)}
                    onSubmit={(input) => {
                      setBusy(true)
                      const field = fieldForm.field
                      ;(field
                        ? saveTemplateField(universeId, template.id, field.id, input)
                        : addTemplateField(universeId, template.id, input)
                      )
                        .then(() => {
                          setFieldForm(null)
                          refresh()
                        })
                        .catch(failing)
                    }}
                  />
                ) : canEdit ? (
                  <button
                    className="button button--text button--sm"
                    type="button"
                    data-testid={`template-field-add-${template.id}`}
                    onClick={() => setFieldForm({ templateId: template.id, field: null })}
                  >
                    {t('projects.schema.addField')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
