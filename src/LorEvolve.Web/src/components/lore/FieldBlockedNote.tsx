import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Archive } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'
import { Button } from '../Button'
import { Callout } from '../Callout'

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
    <BlockedCallout
      className="fieldlist__note"
      testId={`field-blocked-${field.name}`}
      text={blocked.text}
    >
      {field.archivedAt === null ? (
        <Button
          tone="secondary"
          size="sm"
          icon={Archive}
          onClick={() => void archive(field)}
          data-testid={`archive-instead-${field.name}`}
        >
          {t('entityTypes.fields.archiveInstead')}
        </Button>
      ) : null}
      {field.entryCount > field.trashedEntryCount ? (
        <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
          {t('entityTypes.fields.showEntries', { name: type.name })}
        </Link>
      ) : null}
      {field.trashedEntryCount > 0 ? (
        <Link to={`/app/universes/${universeId}/trash`}>{t('entityTypes.fields.openTrash')}</Link>
      ) : null}
    </BlockedCallout>
  )
}

/**
 * A warning that a delete or a restore cannot go ahead as asked: why, in `text`, then the ways out as `children` (a
 * button, links). `className` and `testId` are the caller's, so each box keeps its place and its name.
 */
export function BlockedCallout({
  className,
  testId,
  text,
  children,
}: {
  className: string
  testId: string
  text: string
  children: ReactNode
}) {
  return (
    <Callout look="callout" tone="warning" className={className} role="alert" testId={testId}>
      <p className="types__blockedtext">{text}</p>
      <p className="types__blockedlinks">{children}</p>
    </Callout>
  )
}
