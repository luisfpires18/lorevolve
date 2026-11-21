import { useId, useState } from 'react'
import { addTemplateField, deleteTemplateField, saveTemplateField } from '../../typeTemplates/api'
import type { TypeTemplate } from '../../typeTemplates/types'
import { asFieldDefinition, PROJECT_FIELD_KINDS } from '../../projectEntities/fieldDefinition'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import { confirmDelete } from '../../lib/confirm'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { TypeFieldRow } from '../lore/TypeFieldRow'
import { FieldDialog } from '../lore/FieldDialog'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { t } from '../../i18n'
import { TagList } from '../TagList'

/**
 * One template's row: its icon, name and chip, Edit, Fields and the menu with Delete, then its fields when open, listed
 * and edited the way a Lore type's fields are.
 */
export function TemplateRow({
  universeId,
  canEdit,
  template,
  busy,
  setBusy,
  setEditing,
  openId,
  setOpenId,
  refresh,
  failing,
  remove,
}: {
  universeId: string
  canEdit: boolean
  template: TypeTemplate
  busy: boolean
  setBusy: (busy: boolean) => void
  setEditing: (editing: TypeTemplate) => void
  openId: string | null
  setOpenId: (openId: string | null) => void
  refresh: () => void
  failing: (error: unknown) => void
  remove: (template: TypeTemplate) => Promise<void>
}) {
  const fieldsId = useId()
  // The field drawer: a field being edited, or 'new'.
  const [field, setField] = useState<FieldDefinition | 'new' | null>(null)

  function removeField(each: FieldDefinition) {
    return confirmDelete(
      {
        title: t('entityTypes.fields.deleteTitle', { name: each.name }),
        message: t('entityTypes.fields.deleteMessage'),
        confirmLabel: t('entityTypes.fields.deleteConfirm'),
      },
      () => deleteTemplateField(universeId, template.id, each.id).then(refresh),
      { setBusy, fail: failing },
    )
  }

  return (
    <TypeRow
      name={template.name}
      icon={template.icon}
      testId={`template-${template.id}`}
      data-template-name={template.name}
      badges={<TagList tags={[t('entityTypes.page.templates.chip')]} />}
      actions={
        <TypeRowActions
          name={template.name}
          onEdit={canEdit ? () => setEditing(template) : undefined}
          editTestId={`template-edit-${template.id}`}
          fold={{
            open: openId === template.id,
            count: template.fields.length,
            onToggle: () => setOpenId(openId === template.id ? null : template.id),
            testId: `template-fields-open-${template.id}`,
            controls: fieldsId,
          }}
          onDelete={canEdit ? () => void remove(template) : undefined}
          deleteLabel={t('entityTypes.page.templates.delete')}
          deleteDisabled={busy}
          deleteTestId={`template-delete-${template.id}`}
          menuTestId={`template-actions-${template.id}`}
        />
      }
    >
      {openId === template.id ? (
        <div
          id={fieldsId}
          className="types__fields"
          data-testid={`template-fields-panel-${template.id}`}
        >
          {template.fields.length === 0 ? (
            <QuietNote spacing="flush">{t('projects.schema.noFields')}</QuietNote>
          ) : (
            <ul className="plainlist stack" data-testid={`template-fields-${template.id}`}>
              {template.fields.map((each) => (
                <TypeFieldRow
                  key={each.id}
                  field={asFieldDefinition(each)}
                  canEdit={canEdit}
                  busy={busy}
                  summary={(row) => FIELD_KIND_LABELS[row.kind]}
                  setEditing={setField}
                  remove={removeField}
                />
              ))}
            </ul>
          )}

          {canEdit ? (
            <NewButton
              tone="secondary"
              size="sm"
              data-testid={`template-field-add-${template.id}`}
              onClick={() => setField('new')}
            >
              {t('projects.schema.addField')}
            </NewButton>
          ) : null}

          {field ? (
            <FieldDialog
              field={field === 'new' ? null : field}
              owner={template.name}
              kinds={PROJECT_FIELD_KINDS}
              save={(input) =>
                field === 'new'
                  ? addTemplateField(universeId, template.id, input)
                  : saveTemplateField(universeId, template.id, field.id, input)
              }
              onClose={() => setField(null)}
              onSaved={async () => {
                setField(null)
                refresh()
              }}
            />
          ) : null}
        </div>
      ) : null}
    </TypeRow>
  )
}
