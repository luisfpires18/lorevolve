import { useI18n } from '../../i18n'
import type { FieldDefinition } from '../../lore/typeDefinitions'

/** A field saved by someone else since the drawer opened: what is saved now, and the choice between it and the draft. */
export function FieldStaleNotice({
  latest,
  describe,
  takeSaved,
  keepMine,
}: {
  latest: FieldDefinition
  describe: (field: FieldDefinition) => string
  takeSaved: (saved: FieldDefinition) => void
  keepMine: (saved: FieldDefinition) => void
}) {
  const { t, tx } = useI18n()
  return (
    <div className="callout callout--warning" data-testid="field-dialog-stale">
      <p className="callout__title">{t('entityTypes.fields.savedNow')}</p>
      <p className="fieldconflict__saved">
        {tx(
          latest.archivedAt !== null
            ? 'entityTypes.fields.savedNowArchived'
            : 'entityTypes.fields.savedNowSummary',
          {
            name: <bdi>{latest.name}</bdi>,
            summary: describe(latest),
          },
        )}
      </p>
      <p className="types__blockedlinks">
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={() => takeSaved(latest)}
          data-testid="field-use-saved"
        >
          {t('entityTypes.fields.useSaved')}
        </button>
        {latest.archivedAt === null ? (
          <button
            className="button button--text button--sm"
            type="button"
            onClick={() => keepMine(latest)}
            data-testid="field-keep-mine"
          >
            {t('entityTypes.fields.keepMine')}
          </button>
        ) : null}
      </p>
    </div>
  )
}
