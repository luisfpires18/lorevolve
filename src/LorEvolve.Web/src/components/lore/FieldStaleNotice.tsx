import { useI18n } from '../../i18n'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { Button } from '../Button'
import { Callout } from '../Callout'

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
    <Callout
      look="callout"
      tone="warning"
      testId="field-dialog-stale"
      title={t('entityTypes.fields.savedNow')}
    >
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
        <Button
          tone="secondary"
          size="sm"
          onClick={() => takeSaved(latest)}
          data-testid="field-use-saved"
        >
          {t('entityTypes.fields.useSaved')}
        </Button>
        {latest.archivedAt === null ? (
          <Button
            tone="text"
            size="sm"
            onClick={() => keepMine(latest)}
            data-testid="field-keep-mine"
          >
            {t('entityTypes.fields.keepMine')}
          </Button>
        ) : null}
      </p>
    </Callout>
  )
}
