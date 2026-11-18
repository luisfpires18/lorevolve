import { Pencil } from 'lucide-react'
import type { TypeTemplate } from '../../typeTemplates/types'
import type { ProjectField } from '../../projectEntities/types'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { TypeIcon } from '../TypeIcon'
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
  return (
    <li
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
        <TemplateFields
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
    </li>
  )
}
