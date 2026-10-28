import { findMonth, hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'

export type ChronologyPointPart = 'eraId' | 'year' | 'month' | 'day'

/**
 * A point as it is being typed. Every part stays a string, so an empty box is genuinely empty
 * rather than zero, and a year of 0 stays distinct from no year at all. An empty era is no era
 * chosen yet. On a universe with a custom calendar `month` holds the chosen month's id rather than
 * a number.
 */
export type ChronologyPointDraft = Record<ChronologyPointPart, string>

interface ChronologyPointFieldsProps {
  chronology: Chronology
  /** Each input's id, also its test id. */
  ids: Record<ChronologyPointPart, string>
  eraLabel?: string
  yearLabel?: string
  value: ChronologyPointDraft
  onChange: (part: ChronologyPointPart, value: string) => void
  errors: Partial<Record<ChronologyPointPart, string | undefined>>
}

/**
 * One point on a universe's line as a row of inputs: the date period first when the universe has
 * them, then the year, month and day.
 *
 * The one date period and month picker in LorEvolve. A timeline moment's start and end and a scene's
 * position all come through here, so the periods (stored as eras) and a custom calendar's months
 * are offered, labelled and ruled the same way everywhere - a year inside a period counts from 1
 * with no upper bound, a plain year is signed, and a day runs to its own month's length. On a
 * universe with simple dates the month and day are the numbers they always were.
 */
export function ChronologyPointFields({
  chronology,
  ids,
  eraLabel = 'Date period',
  yearLabel = 'Year',
  value,
  onChange,
  errors,
}: ChronologyPointFieldsProps) {
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)
  const month = custom ? findMonth(chronology, value.month) : null
  const errorId = (part: ChronologyPointPart) => (errors[part] ? `${ids[part]}-error` : undefined)

  return (
    <div
      className={reckonsInEras ? 'momentform__point momentform__point--era' : 'momentform__point'}
    >
      {reckonsInEras ? (
        <div className="field">
          <label className="field__label" htmlFor={ids.eraId}>
            {eraLabel}
          </label>
          <select
            id={ids.eraId}
            className="field__input field__input--select"
            value={value.eraId}
            onChange={(event) => onChange('eraId', event.target.value)}
            aria-invalid={errors.eraId ? true : undefined}
            aria-describedby={errorId('eraId')}
            data-testid={ids.eraId}
          >
            <option value="">Choose a date period</option>
            {chronology.eras.map((option) => (
              <option key={option.id} value={option.id}>
                {option.abbreviation ? `${option.name} (${option.abbreviation})` : option.name}
              </option>
            ))}
          </select>
          {errors.eraId ? (
            <p className="field__error" id={errorId('eraId')}>
              {errors.eraId}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor={ids.year}>
          {yearLabel}
        </label>
        <input
          id={ids.year}
          className="field__input"
          type="number"
          step="1"
          min={reckonsInEras ? 1 : undefined}
          inputMode="numeric"
          placeholder="Insert a year"
          value={value.year}
          onChange={(event) => onChange('year', event.target.value)}
          aria-invalid={errors.year ? true : undefined}
          aria-describedby={errorId('year')}
          data-testid={ids.year}
        />
        {errors.year ? (
          <p className="field__error" id={errorId('year')}>
            {errors.year}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={ids.month}>
          Month
        </label>
        {custom ? (
          <select
            id={ids.month}
            className="field__input field__input--select"
            value={value.month}
            onChange={(event) => {
              onChange('month', event.target.value)
              // A day only means something inside a month, so taking the month away takes the day too.
              if (event.target.value === '') onChange('day', '')
            }}
            aria-invalid={errors.month ? true : undefined}
            aria-describedby={errorId('month')}
            data-testid={ids.month}
          >
            <option value="">No month</option>
            {chronology.calendar?.months.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.dayCount === 1 ? '1 day' : `${option.dayCount} days`}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={ids.month}
            className="field__input"
            type="number"
            step="1"
            min={1}
            max={12}
            inputMode="numeric"
            placeholder="Insert a month"
            value={value.month}
            onChange={(event) => onChange('month', event.target.value)}
            aria-invalid={errors.month ? true : undefined}
            aria-describedby={errorId('month')}
            data-testid={ids.month}
          />
        )}
        {errors.month ? (
          <p className="field__error" id={errorId('month')}>
            {errors.month}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={ids.day}>
          Day
        </label>
        <input
          id={ids.day}
          className="field__input"
          type="number"
          step="1"
          min={1}
          max={custom ? month?.dayCount : 31}
          inputMode="numeric"
          placeholder="Insert a day"
          disabled={custom && !month && value.day === ''}
          value={value.day}
          onChange={(event) => onChange('day', event.target.value)}
          aria-invalid={errors.day ? true : undefined}
          aria-describedby={errorId('day')}
          data-testid={ids.day}
        />
        {errors.day ? (
          <p className="field__error" id={errorId('day')}>
            {errors.day}
          </p>
        ) : null}
      </div>
    </div>
  )
}
