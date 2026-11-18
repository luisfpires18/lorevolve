import { addTemplateField, deleteTemplateField, saveTemplateField } from '../../typeTemplates/api'
import type { TypeTemplate } from '../../typeTemplates/types'
import type { ProjectField } from '../../projectEntities/types'
import { ActionMenu } from '../ActionMenu'
import { FieldForm, kindLabel } from '../FieldForm'
import { t } from '../../i18n'
import { Button } from '../Button'

/** A template's open fields panel: each field with Edit and Delete, the field form, and Add field. */
export function TemplateFields({
  universeId,
  canEdit,
  template,
  busy,
  setBusy,
  fieldForm,
  setFieldForm,
  refresh,
  failing,
}: {
  universeId: string
  canEdit: boolean
  template: TypeTemplate
  busy: boolean
  setBusy: (busy: boolean) => void
  fieldForm: { templateId: string; field: ProjectField | null } | null
  setFieldForm: (fieldForm: { templateId: string; field: ProjectField | null } | null) => void
  refresh: () => void
  failing: (error: unknown) => void
}) {
  return (
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
        <Button
          tone="text"
          size="sm"
          data-testid={`template-field-add-${template.id}`}
          onClick={() => setFieldForm({ templateId: template.id, field: null })}
        >
          {t('projects.schema.addField')}
        </Button>
      ) : null}
    </div>
  )
}
