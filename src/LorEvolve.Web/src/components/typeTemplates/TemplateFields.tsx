import { addTemplateField, deleteTemplateField, saveTemplateField } from '../../typeTemplates/api'
import type { TypeTemplate } from '../../typeTemplates/types'
import type { ProjectField } from '../../projectEntities/types'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { FieldForm } from '../FieldForm'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import { t } from '../../i18n'
import { NewButton } from '../NewButton'
import { Pencil, Trash } from 'lucide-react'
import { confirmAction } from '../../lib/confirm'
import { QuietNote } from '../QuietNote'

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
  id,
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
  /** The panel's id, which the row's Fields button names in `aria-controls`. */
  id?: string
}) {
  return (
    <div id={id} className="types__fields" data-testid={`template-fields-panel-${template.id}`}>
      {template.fields.length === 0 ? (
        <QuietNote>{t('projects.schema.noFields')}</QuietNote>
      ) : (
        <ul className="fieldlist" data-testid={`template-fields-${template.id}`}>
          {template.fields.map((field) => (
            <li key={field.id} className="fieldlist__row">
              <span className="fieldlist__text">
                <span className="fieldlist__name">{field.name}</span>
                <span className="fieldlist__meta">{FIELD_KIND_LABELS[field.kind]}</span>
              </span>
              {canEdit ? (
                <div className="actions actions--compact fieldlist__actions">
                  <ActionMenu
                    label={t('projects.common.more', { name: field.name })}
                    triggerTestId={`template-field-actions-${field.id}`}
                  >
                    <ActionMenuItem
                      icon={Pencil}
                      testId={`template-field-edit-${field.id}`}
                      onClick={() => setFieldForm({ templateId: template.id, field })}
                    >
                      {t('entityTypes.page.templates.editField')}
                    </ActionMenuItem>
                    <ActionMenuItem
                      icon={Trash}
                      tone="danger"
                      disabled={busy}
                      testId={`template-field-delete-${field.id}`}
                      onClick={async () => {
                        const confirmed = await confirmAction({
                          title: t('entityTypes.fields.deleteTitle', { name: field.name }),
                          message: t('entityTypes.fields.deleteMessage'),
                          confirmLabel: t('entityTypes.fields.deleteConfirm'),
                          variant: 'destructive',
                        })
                        if (!confirmed) return
                        setBusy(true)
                        deleteTemplateField(universeId, template.id, field.id)
                          .then(refresh)
                          .catch(failing)
                      }}
                    >
                      {t('projects.schema.deleteField')}
                    </ActionMenuItem>
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
        <NewButton
          tone="secondary"
          size="sm"
          data-testid={`template-field-add-${template.id}`}
          onClick={() => setFieldForm({ templateId: template.id, field: null })}
        >
          {t('projects.schema.addField')}
        </NewButton>
      ) : null}
    </div>
  )
}
