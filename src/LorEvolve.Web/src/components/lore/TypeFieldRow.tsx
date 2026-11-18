import { Archive, Pencil, Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { useI18n } from '../../i18n'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'
import { FieldBlockedNote } from './FieldBlockedNote'
import { Button } from '../Button'

/** One active field: its name and summary, Edit, the menu with Archive and Delete, and why it cannot be deleted. */
export function TypeFieldRow({
  universeId,
  type,
  canEdit,
  field,
  busyFieldId,
  blocked,
  summary,
  clear,
  setEditing,
  archive,
  remove,
}: {
  universeId: string
  type: EntityType
  canEdit: boolean
  field: FieldDefinition
  busyFieldId: string | null
  blocked: { fieldId: string; text: string } | null
  summary: (field: FieldDefinition) => string
  clear: () => void
  setEditing: (editing: FieldDefinition) => void
  archive: (field: FieldDefinition) => Promise<void>
  remove: (field: FieldDefinition) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <li
      className="fieldlist__row"
      data-field-name={field.name}
      data-testid={`field-row-${field.name}`}
    >
      <div className="fieldlist__text">
        <span className="fieldlist__name">
          <bdi>{field.name}</bdi>
        </span>
        <span className="fieldlist__meta" data-testid={`field-summary-${field.name}`}>
          {summary(field)}
        </span>
      </div>
      {canEdit ? (
        <span className="fieldlist__actions">
          <Button
            tone="secondary"
            size="sm"
            icon={Pencil}
            onClick={() => {
              clear()
              setEditing(field)
            }}
            disabled={busyFieldId === field.id}
            aria-label={t('entityTypes.fields.editField', { name: field.name })}
            data-testid={`edit-field-${field.name}`}
          >
            {t('entityTypes.fields.edit')}
          </Button>
          <ActionMenu
            label={t('entityTypes.fields.moreActions', { name: field.name })}
            triggerTestId={`field-actions-${field.name}`}
          >
            <button
              className="actionmenu__item"
              type="button"
              onClick={() => void archive(field)}
              data-testid={`archive-field-${field.name}`}
            >
              <ActionIcon icon={Archive} />
              {t('entityTypes.fields.archiveField')}
            </button>
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              onClick={() => void remove(field)}
              data-testid={`delete-field-${field.name}`}
            >
              <ActionIcon icon={Trash2} />
              {t('entityTypes.fields.deleteField')}
            </button>
          </ActionMenu>
        </span>
      ) : null}
      <FieldBlockedNote
        universeId={universeId}
        type={type}
        field={field}
        blocked={blocked}
        archive={archive}
      />
    </li>
  )
}
