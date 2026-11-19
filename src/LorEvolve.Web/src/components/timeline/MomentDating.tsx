import { Field } from '../Field'
import { SegmentedControl } from '../SegmentedControl'
import { ChronologyPointFields, type ChronologyPointPart } from '../ChronologyPointFields'
import type { Chronology } from '../../chronology/types'
import { t, useI18n } from '../../i18n'
import {
  DATE_KIND_HINTS,
  DATE_KIND_LABELS,
  DATE_KIND_ORDER,
  type DateKindValue,
  DATE_KIND_KEYS,
} from '../../timeline/types'
import type { ComponentKey, EraKey, MomentDraft } from '../../timeline/momentDraft'

/** When the moment happens: the kind of date, the dates themselves, and the periods on a universe that names them. */
export function MomentDating({
  chronology,
  reckonsInEras,
  draft,
  edit,
  setComponent,
  chooseKind,
  fieldErrors,
  isRange,
  isDated,
}: {
  chronology: Chronology
  reckonsInEras: boolean
  draft: MomentDraft
  edit: (change: Partial<MomentDraft>) => void
  setComponent: (key: ComponentKey | EraKey, value: string) => void
  chooseKind: (dateKind: DateKindValue) => void
  fieldErrors: Record<string, string>
  isRange: boolean
  isDated: boolean
}) {
  const { tx } = useI18n()

  function point(
    prefix: 'start' | 'end',
    yearLabel: string,
    errors: {
      era: string | undefined
      year: string | undefined
      month: string | undefined
      day: string | undefined
    },
  ) {
    const keys: Record<ChronologyPointPart, ComponentKey | EraKey> =
      prefix === 'start'
        ? { eraId: 'startEraId', year: 'startYear', month: 'startMonth', day: 'startDay' }
        : { eraId: 'endEraId', year: 'endYear', month: 'endMonth', day: 'endDay' }

    return (
      <ChronologyPointFields
        chronology={chronology}
        ids={{
          eraId: `moment-${keys.eraId}`,
          year: `moment-${keys.year}`,
          month: `moment-${keys.month}`,
          day: `moment-${keys.day}`,
        }}
        eraLabel={
          prefix === 'start'
            ? isRange
              ? t('time.momentForm.startsInPeriod')
              : t('time.momentForm.datePeriod')
            : t('time.momentForm.endsInPeriod')
        }
        yearLabel={yearLabel}
        value={{
          eraId: draft[keys.eraId],
          year: draft[keys.year],
          month: draft[keys.month],
          day: draft[keys.day],
        }}
        onChange={(part, next) => setComponent(keys[part], next)}
        errors={{ eraId: errors.era, year: errors.year, month: errors.month, day: errors.day }}
      />
    )
  }

  return (
    <>
      <Field
        label={t('time.momentForm.when')}
        group
        hint={DATE_KIND_HINTS[draft.dateKind]}
        error={fieldErrors.datekind}
      >
        {(control) => (
          <SegmentedControl
            {...control}
            options={DATE_KIND_ORDER.map((option) => ({
              value: option,
              label: DATE_KIND_LABELS[option],
              testId: `moment-kind-${DATE_KIND_KEYS[option]}`,
            }))}
            value={draft.dateKind}
            onChange={chooseKind}
          />
        )}
      </Field>

      {isDated ? (
        <>
          {point('start', isRange ? t('time.momentForm.startsInYear') : t('time.momentForm.year'), {
            era: fieldErrors.starteraid,
            year: fieldErrors.startyear,
            month: fieldErrors.startmonth,
            day: fieldErrors.startday,
          })}

          {isRange
            ? point('end', t('time.momentForm.endsInYear'), {
                era: fieldErrors.enderaid,
                year: fieldErrors.endyear,
                month: fieldErrors.endmonth,
                day: fieldErrors.endday,
              })
            : null}
        </>
      ) : null}

      {reckonsInEras ? (
        draft.eraLabel ? (
          <p className="field__hint" data-testid="moment-old-label">
            {tx('time.momentForm.oldLabel', { label: <bdi>{draft.eraLabel}</bdi> })}
          </p>
        ) : null
      ) : (
        <Field
          label={t('time.momentForm.yearLabel')}
          id="moment-era"
          hint={t('time.momentForm.yearLabelHint')}
          error={fieldErrors.eralabel}
        >
          {(control) => (
            <input
              {...control}
              className="field__input"
              type="text"
              placeholder={t('time.momentForm.optional')}
              value={draft.eraLabel}
              onChange={(event) => edit({ eraLabel: event.target.value })}
              data-testid="moment-era"
            />
          )}
        </Field>
      )}
    </>
  )
}
