import { Link } from 'react-router-dom'
import { Archive } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'

/** Under a field that cannot be deleted: why, where its entries are, and archiving as the way out. */
export function FieldBlockedNote({
  universeId,
  type,
  field,
  blocked,
  archive,
}: {
  universeId: string
  type: EntityType
  field: FieldDefinition
  blocked: { fieldId: string; text: string } | null
  archive: (field: FieldDefinition) => Promise<void>
}) {
  const { t } = useI18n()
  if (blocked?.fieldId !== field.id) return null
  return (
    <div
      className="callout callout--warning fieldlist__note"
      role="alert"
      data-testid={`field-blocked-${field.name}`}
    >
      <p className="types__blockedtext">{blocked.text}</p>
      <p className="types__blockedlinks">
        {field.archivedAt === null ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => void archive(field)}
            data-testid={`archive-instead-${field.name}`}
          >
            <ActionIcon icon={Archive} />
            {t('entityTypes.fields.archiveInstead')}
          </button>
        ) : null}
        {field.entryCount > field.trashedEntryCount ? (
          <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
            {t('entityTypes.fields.showEntries', { name: type.name })}
          </Link>
        ) : null}
        {field.trashedEntryCount > 0 ? (
          <Link to={`/app/universes/${universeId}/trash`}>{t('entityTypes.fields.openTrash')}</Link>
        ) : null}
      </p>
    </div>
  )
}
