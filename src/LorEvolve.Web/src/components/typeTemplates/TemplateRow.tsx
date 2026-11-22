import { useId } from 'react'
import { addTemplateField, deleteTemplateField, saveTemplateField } from '../../typeTemplates/api'
import type { TypeTemplate } from '../../typeTemplates/types'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { PlainFieldsPanel } from '../lore/FieldsPanel'
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
        <PlainFieldsPanel
          id={fieldsId}
          testIds={{
            panel: `template-fields-panel-${template.id}`,
            list: `template-fields-${template.id}`,
            add: `template-field-add-${template.id}`,
          }}
          owner={template.name}
          fields={template.fields}
          canEdit={canEdit}
          busy={busy}
          setBusy={setBusy}
          failing={failing}
          refresh={refresh}
          deleteMessage={t('entityTypes.fields.deleteMessage')}
          add={(input) => addTemplateField(universeId, template.id, input)}
          save={(fieldId, input) => saveTemplateField(universeId, template.id, fieldId, input)}
          remove={(fieldId) => deleteTemplateField(universeId, template.id, fieldId)}
        />
      ) : null}
    </TypeRow>
  )
}
