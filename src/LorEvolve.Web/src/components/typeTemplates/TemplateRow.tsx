import { useId } from 'react'
import type { TypeTemplate } from '../../typeTemplates/types'
import type { ProjectField } from '../../projectEntities/types'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { t } from '../../i18n'
import { TemplateFields } from './TemplateFields'

/** One template's row: its icon, name and chip, Edit, Fields and the menu with Delete, then its fields when open. */
export function TemplateRow({
  universeId,
  canEdit,
  template,
  busy,
  setBusy,
  setEditing,
  openId,
  setOpenId,
  fieldForm,
  setFieldForm,
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
  fieldForm: { templateId: string; field: ProjectField | null } | null
  setFieldForm: (fieldForm: { templateId: string; field: ProjectField | null } | null) => void
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
      badges={<span className="chip">{t('entityTypes.page.templates.chip')}</span>}
      actions={
        <TypeRowActions
          name={template.name}
          onEdit={canEdit ? () => setEditing(template) : undefined}
          editTestId={`template-edit-${template.id}`}
          fields={{
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
        <TemplateFields
          id={fieldsId}
          universeId={universeId}
          canEdit={canEdit}
          template={template}
          busy={busy}
          setBusy={setBusy}
          fieldForm={fieldForm}
          setFieldForm={setFieldForm}
          refresh={refresh}
          failing={failing}
        />
      ) : null}
    </TypeRow>
  )
}
