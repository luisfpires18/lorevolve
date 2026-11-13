import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import {
  ChronologyPointFields,
  type ChronologyPointDraft,
  type ChronologyPointPart,
} from './ChronologyPointFields'
import type { Chronology } from '../chronology/types'
import { useI18n } from '../i18n'
import { newPeriod, type PeriodDraft } from '../relationships/periods'

/** An era either end of the link has, offered as a period: "Frieza Saga (Goku)". */
export interface EraChoice {
  id: string
  label: string
}

/**
 * When a relation holds (Issue #18). None means always, as every relation always was. Each period is a dated span on the
 * universe's own chronology - either end may be left open, and a year alone covers the whole year - or the whole of one era
 * of either entry. A relation that ended and began again gets a second period, never a second relation.
 */
export function RelationshipPeriodsField({
  chronology,
  eras,
  erasReading,
  erasFailed,
  value,
  onChange,
  errors,
}: {
  chronology: Chronology
  eras: EraChoice[]
  /** Either entry's eras are still being read. */
  erasReading: boolean
  /** Either entry's eras could not be read. */
  erasFailed: boolean
  value: PeriodDraft[]
  onChange: (periods: PeriodDraft[]) => void
  /** The save's errors, lowercased by key: `periods[0].start.year`. */
  errors: Record<string, string>
}) {
  const { t } = useI18n()
  const hintId = useId()
  const noEras = !erasReading && !erasFailed && eras.length === 0

  function patch(index: number, change: Partial<PeriodDraft>) {
    onChange(value.map((period, at) => (at === index ? { ...period, ...change } : period)))
  }

  return (
    <fieldset className="relperiods" aria-describedby={hintId} data-testid="relation-periods">
      <legend className="field__label">{t('relationships.periods.legend')}</legend>
      <p className="field__hint" id={hintId}>
        {value.length === 0
          ? erasFailed
            ? t('relationships.periods.hintAlwaysFailed')
            : t('relationships.periods.hintAlways')
          : erasFailed
            ? t('relationships.periods.hintDuringFailed')
            : t('relationships.periods.hintDuring')}
      </p>

      {errors['periods'] ? <p className="field__error">{errors['periods']}</p> : null}

      {value.map((period, index) => {
        const key = `periods[${index}]`
        const error = (part: string) => errors[`${key}.${part}`.toLowerCase()]
        const label = t('relationships.periods.period', { n: index + 1 })
        const eraError = error('entityEraId')
        // A stored era stays chosen and named even before - or without - the eras being read.
        const options =
          period.entityEraId && !eras.some((era) => era.id === period.entityEraId)
            ? [
                {
                  id: period.entityEraId,
                  label: period.eraLabel ?? t('relationships.periods.chosenStage'),
                },
                ...eras,
              ]
            : eras

        return (
          <div className="relperiod" key={period.key} data-testid={`relation-period-${index}`}>
            <div className="relperiod__head">
              <p className="relperiod__label">{label}</p>
              <div
                className="segmented"
                role="group"
                aria-label={t('relationships.periods.datesOrEra', { n: index + 1 })}
              >
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={period.kind === 'dates'}
                  onClick={() => patch(index, { kind: 'dates' })}
                  data-testid={`relation-period-${index}-dates`}
                >
                  {t('relationships.periods.dates')}
                </button>
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={period.kind === 'era'}
                  disabled={noEras && period.kind !== 'era'}
                  title={noEras ? t('relationships.periods.noStages') : undefined}
                  onClick={() => patch(index, { kind: 'era' })}
                  data-testid={`relation-period-${index}-era`}
                >
                  {t('relationships.periods.stage')}
                </button>
              </div>
              <button
                type="button"
                className="iconbutton"
                aria-label={t('relationships.periods.remove', { n: index + 1 })}
                title={t('relationships.periods.remove', { n: index + 1 })}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
                data-testid={`relation-period-${index}-remove`}
              >
                <X aria-hidden="true" focusable="false" strokeWidth={1.75} />
              </button>
            </div>

            {errors[key] ? <p className="field__error">{errors[key]}</p> : null}

            {period.kind === 'era' ? (
              <div className="field">
                <label className="field__label" htmlFor={`${period.key}-era`}>
                  {t('relationships.periods.era')}
                </label>
                <select
                  id={`${period.key}-era`}
                  className="field__input field__input--select"
                  value={period.entityEraId}
                  onChange={(event) => {
                    const chosen = options.find((era) => era.id === event.target.value)
                    patch(index, {
                      entityEraId: event.target.value,
                      eraLabel: chosen?.label ?? null,
                    })
                  }}
                  aria-invalid={eraError ? true : undefined}
                  aria-describedby={eraError ? `${period.key}-era-error` : undefined}
                  data-testid={`relation-period-${index}-era-select`}
                >
                  <option value="">
                    {erasReading
                      ? t('relationships.periods.readingStages')
                      : t('relationships.periods.chooseStage')}
                  </option>
                  {options.map((era) => (
                    <option key={era.id} value={era.id}>
                      {era.label}
                    </option>
                  ))}
                </select>
                {eraError ? (
                  <p className="field__error" id={`${period.key}-era-error`}>
                    {eraError}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <PeriodPoint
                  bound="start"
                  prefix={`${period.key}-start`}
                  chronology={chronology}
                  value={period.start}
                  onChange={(start) => patch(index, { start })}
                  error={(part) => error(`start.${part}`)}
                />
                <PeriodPoint
                  bound="end"
                  prefix={`${period.key}-end`}
                  chronology={chronology}
                  value={period.end}
                  onChange={(end) => patch(index, { end })}
                  error={(part) => error(`end.${part}`)}
                />
              </>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="button button--secondary button--sm"
        onClick={() => onChange([...value, newPeriod()])}
        data-testid="relation-period-add"
      >
        <ActionIcon icon={Plus} />
        {t('relationships.periods.add')}
      </button>
    </fieldset>
  )
}

/** One bound of a dated period, grouped under its own legend so each of its inputs is read as "From" or "To". */
function PeriodPoint({
  bound,
  prefix,
  chronology,
  value,
  onChange,
  error,
}: {
  bound: 'start' | 'end'
  prefix: string
  chronology: Chronology
  value: ChronologyPointDraft
  onChange: (next: ChronologyPointDraft) => void
  error: (part: string) => string | undefined
}) {
  const { t } = useI18n()
  const start = bound === 'start'
  const legend = start ? t('relationships.periods.from') : t('relationships.periods.to')
  return (
    <fieldset className="erapoint">
      <legend className="erapoint__label">{legend}</legend>
      <ChronologyPointFields
        chronology={chronology}
        ids={{
          eraId: `${prefix}-eraId`,
          year: `${prefix}-year`,
          month: `${prefix}-month`,
          day: `${prefix}-day`,
        }}
        eraLabel={
          start
            ? t('relationships.periods.fromDatePeriod')
            : t('relationships.periods.toDatePeriod')
        }
        yearLabel={start ? t('relationships.periods.fromYear') : t('relationships.periods.toYear')}
        value={value}
        onChange={(part: ChronologyPointPart, next: string) => onChange({ ...value, [part]: next })}
        errors={{
          eraId: error('eraId'),
          year: error('year'),
          month: error('month'),
          day: error('day'),
        }}
      />
    </fieldset>
  )
}
