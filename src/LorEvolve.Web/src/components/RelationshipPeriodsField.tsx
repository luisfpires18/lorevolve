import { useId } from 'react'
import { Plus, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import {
  ChronologyPointFields,
  type ChronologyPointDraft,
  type ChronologyPointPart,
} from './ChronologyPointFields'
import type { Chronology } from '../chronology/types'
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
  const hintId = useId()
  const noEras = !erasReading && !erasFailed && eras.length === 0

  function patch(index: number, change: Partial<PeriodDraft>) {
    onChange(value.map((period, at) => (at === index ? { ...period, ...change } : period)))
  }

  return (
    <fieldset className="relperiods" aria-describedby={hintId} data-testid="relation-periods">
      <legend className="field__label">When it holds</legend>
      <p className="field__hint" id={hintId}>
        {value.length === 0
          ? 'Always, unless you add a period. A relation that ended and began again gets a second period.'
          : 'It holds during any of these.'}
        {erasFailed ? ' The entries’ stages could not be read, so none can be chosen now.' : ''}
      </p>

      {errors['periods'] ? <p className="field__error">{errors['periods']}</p> : null}

      {value.map((period, index) => {
        const key = `periods[${index}]`
        const error = (part: string) => errors[`${key}.${part}`.toLowerCase()]
        const label = `Period ${index + 1}`
        const eraError = error('entityEraId')
        // A stored era stays chosen and named even before - or without - the eras being read.
        const options =
          period.entityEraId && !eras.some((era) => era.id === period.entityEraId)
            ? [{ id: period.entityEraId, label: period.eraLabel ?? 'Chosen stage' }, ...eras]
            : eras

        return (
          <div className="relperiod" key={period.key} data-testid={`relation-period-${index}`}>
            <div className="relperiod__head">
              <p className="relperiod__label">{label}</p>
              <div className="segmented" role="group" aria-label={`${label}: dates or an era`}>
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={period.kind === 'dates'}
                  onClick={() => patch(index, { kind: 'dates' })}
                  data-testid={`relation-period-${index}-dates`}
                >
                  Dates
                </button>
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={period.kind === 'era'}
                  disabled={noEras && period.kind !== 'era'}
                  title={noEras ? 'Neither entry has stages yet.' : undefined}
                  onClick={() => patch(index, { kind: 'era' })}
                  data-testid={`relation-period-${index}-era`}
                >
                  A stage
                </button>
              </div>
              <button
                type="button"
                className="iconbutton"
                aria-label={`Remove ${label.toLowerCase()}`}
                title={`Remove ${label.toLowerCase()}`}
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
                  Era
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
                  <option value="">{erasReading ? 'Reading stages…' : 'Choose a stage'}</option>
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
                  legend="From"
                  prefix={`${period.key}-start`}
                  chronology={chronology}
                  value={period.start}
                  onChange={(start) => patch(index, { start })}
                  error={(part) => error(`start.${part}`)}
                />
                <PeriodPoint
                  legend="To"
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
        Add a period
      </button>
    </fieldset>
  )
}

/** One bound of a dated period, grouped under its own legend so each of its inputs is read as "From" or "To". */
function PeriodPoint({
  legend,
  prefix,
  chronology,
  value,
  onChange,
  error,
}: {
  legend: string
  prefix: string
  chronology: Chronology
  value: ChronologyPointDraft
  onChange: (next: ChronologyPointDraft) => void
  error: (part: string) => string | undefined
}) {
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
        eraLabel={`${legend}: date period`}
        yearLabel={`${legend}: year`}
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
