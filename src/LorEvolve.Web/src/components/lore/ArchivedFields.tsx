import { Link } from 'react-router-dom'
import { ArchiveRestore } from 'lucide-react'
import { useI18n } from '../../i18n'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import { entries } from '../../lore/fieldInUse'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'
import { FieldBlockedNote } from './FieldBlockedNote'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'
import { Callout } from '../Callout'

/** A type's archived fields, folded apart: each with Restore, Delete when it is empty, and the way back as optional. */
export function ArchivedFields({
  universeId,
  type,
  canEdit,
  archived,
  busyFieldId,
  blocked,
  restoreOffer,
  sectionName,
  archive,
  restore,
  remove,
}: {
  universeId: string
  type: EntityType
  canEdit: boolean
  archived: FieldDefinition[]
  busyFieldId: string | null
  blocked: { fieldId: string; text: string } | null
  restoreOffer: { fieldId: string; text: string } | null
  sectionName: (sectionId: string | null) => string | null
  archive: (field: FieldDefinition) => Promise<void>
  restore: (field: FieldDefinition, asOptional?: boolean) => Promise<void>
  remove: (field: FieldDefinition) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <details
      className="fieldarchive"
      open={restoreOffer !== null || archived.some((field) => field.id === blocked?.fieldId)}
      data-testid={`archived-fields-${type.name}`}
    >
      <summary>{t('entityTypes.fields.archivedSummary', { n: archived.length })}</summary>
      <QuietNote className="fieldarchive__lede">
        {t('entityTypes.fields.archivedLede', { name: type.name })}
      </QuietNote>
      <ul
        className="fieldlist"
        aria-label={t('entityTypes.fields.archivedLabel', { name: type.name })}
      >
        {archived.map((field) => (
          <li
            className="fieldlist__row"
            key={field.id}
            data-field-name={field.name}
            data-testid={`archived-field-${field.name}`}
          >
            <div className="fieldlist__text">
              <span className="fieldlist__name">
                <bdi>{field.name}</bdi>
              </span>
              <span className="fieldlist__meta">
                {[
                  FIELD_KIND_LABELS[field.kind],
                  field.isRequired ? t('entityTypes.fields.previouslyRequired') : null,
                  sectionName(field.sectionId),
                  field.entryCount === 0
                    ? t('entityTypes.fields.noValues')
                    : t('entityTypes.fields.valuesIn', { entries: entries(field.entryCount) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {canEdit ? (
              <span className="actions actions--compact fieldlist__actions">
                <Button
                  tone="secondary"
                  size="sm"
                  icon={ArchiveRestore}
                  onClick={() => void restore(field)}
                  disabled={busyFieldId === field.id}
                  aria-label={t('entityTypes.fields.restoreField', { name: field.name })}
                  data-testid={`restore-field-${field.name}`}
                >
                  {t('entityTypes.fields.restore')}
                </Button>
                {field.entryCount === 0 && !field.usedInHistory ? (
                  <Button
                    tone="danger-quiet"
                    size="sm"
                    className="fieldlist__delete"
                    onClick={() => void remove(field)}
                    disabled={busyFieldId === field.id}
                    aria-label={t('entityTypes.fields.deleteForGood', { name: field.name })}
                    data-testid={`delete-archived-field-${field.name}`}
                  >
                    {t('entityTypes.fields.delete')}
                  </Button>
                ) : null}
              </span>
            ) : null}
            {restoreOffer?.fieldId === field.id ? (
              <Callout
                look="callout"
                tone="warning"
                className="fieldlist__note"
                role="alert"
                testId={`restore-offer-${field.name}`}
              >
                <p className="types__blockedtext">{restoreOffer.text}</p>
                <p className="types__blockedlinks">
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() => void restore(field, true)}
                    disabled={busyFieldId === field.id}
                    data-testid={`restore-optional-${field.name}`}
                  >
                    {t('entityTypes.fields.restoreOptional')}
                  </Button>
                  <Link to={`/app/universes/${universeId}/lore?type=${type.id}`}>
                    {t('entityTypes.fields.restoreShowEntries', { name: type.name })}
                  </Link>
                </p>
              </Callout>
            ) : null}
            <FieldBlockedNote
              universeId={universeId}
              type={type}
              field={field}
              blocked={blocked}
              archive={archive}
            />
          </li>
        ))}
      </ul>
    </details>
  )
}
