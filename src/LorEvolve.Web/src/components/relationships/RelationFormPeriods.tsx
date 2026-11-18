import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { formatSpan } from '../../lib/dates'
import { RelationshipPeriodsField, type EraChoice } from '../RelationshipPeriodsField'
import type { Chronology } from '../../chronology/types'
import type { RelationDraft } from '../../relationships/relationDraft'
import type { useRelationsState } from '../../relationships/useRelationsState'

export function RelationFormPeriods({
  chronology,
  eraChoices,
  ends,
  erasOf,
  draft,
  edit,
  fieldErrors,
}: {
  chronology: Chronology
  eraChoices: EraChoice[]
  ends: string[]
  erasOf: ReturnType<typeof useRelationsState>['erasOf']
  draft: RelationDraft
  edit: (change: Partial<RelationDraft>) => void
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()

  return (
    <>
      <RelationshipPeriodsField
        chronology={chronology}
        eras={eraChoices}
        erasReading={ends.some((id) => erasOf[id]?.status === 'loading')}
        erasFailed={ends.some((id) => erasOf[id]?.status === 'failed')}
        value={draft.periods}
        onChange={(periods) => edit({ periods })}
        errors={fieldErrors}
      />

      {/* The real-world dates a relation could carry before it could be placed in the universe's own time: kept, shown and
          clearable, never typed any more (Issue #18). */}
      {draft.legacyStart || draft.legacyEnd ? (
        <Field
          label={t('relationships.section.legacyLabel')}
          group
          className="relform__legacy"
          data-testid="relation-legacy-dates"
          hint={t('relationships.section.legacyHint', {
            span: formatSpan(draft.legacyStart, draft.legacyEnd) ?? '',
          })}
          error={fieldErrors.enddate}
        >
          {(control) => (
            <div {...control}>
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={() => edit({ legacyStart: null, legacyEnd: null })}
                data-testid="relation-legacy-clear"
              >
                {t('relationships.section.legacyClear')}
              </button>
            </div>
          )}
        </Field>
      ) : null}
    </>
  )
}
