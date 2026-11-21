import { useI18n } from '../../i18n'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { StaleChoice } from '../StaleChoice'

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
    <StaleChoice
      testId="field"
      boxId="field-dialog-stale"
      loadId="field-use-saved"
      title={t('entityTypes.fields.savedNow')}
      text={tx(
        latest.archivedAt !== null
          ? 'entityTypes.fields.savedNowArchived'
          : 'entityTypes.fields.savedNowSummary',
        { name: <bdi>{latest.name}</bdi>, summary: describe(latest) },
      )}
      loadLabel={t('entityTypes.fields.useSaved')}
      onLoadSaved={() => takeSaved(latest)}
      onKeepMine={latest.archivedAt === null ? () => keepMine(latest) : undefined}
      keepLabel={t('entityTypes.fields.keepMine')}
    />
  )
}
