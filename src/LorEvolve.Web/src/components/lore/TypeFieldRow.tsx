import { Archive, Pencil, Trash2 } from 'lucide-react'
import { ActionMenuItem } from '../ActionMenu'
import { RowMenu } from '../RowMenu'
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
        <span className="actions actions--compact fieldlist__actions">
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
          <RowMenu
            label={t('entityTypes.fields.moreActions', { name: field.name })}
            triggerTestId={`field-actions-${field.name}`}
            onRemove={() => void remove(field)}
            removeIcon={Trash2}
            removeLabel={t('entityTypes.fields.deleteField')}
            removeTestId={`delete-field-${field.name}`}
          >
            <ActionMenuItem
              icon={Archive}
              onClick={() => void archive(field)}
              testId={`archive-field-${field.name}`}
            >
              {t('entityTypes.fields.archiveField')}
            </ActionMenuItem>
          </RowMenu>
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
