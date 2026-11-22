import { Field } from './Field'
import { useI18n } from '../i18n'
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
  eraLabel,
  yearLabel,
  value,
  onChange,
  errors,
}: ChronologyPointFieldsProps) {
  const { t, tn } = useI18n()
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)
  const month = custom ? findMonth(chronology, value.month) : null

  return (
    <div
      className={reckonsInEras ? 'momentform__point momentform__point--era' : 'momentform__point'}
    >
      {reckonsInEras ? (
        <Field
          as="select"
          id={ids.eraId}
          label={eraLabel ?? t('time.point.era')}
          error={errors.eraId}
          value={value.eraId}
          onChange={(event) => onChange('eraId', event.target.value)}
          data-testid={ids.eraId}
        >
          <option value="">{t('time.point.chooseEra')}</option>
          {chronology.eras.map((option) => (
            <option key={option.id} value={option.id}>
              {option.abbreviation ? `${option.name} (${option.abbreviation})` : option.name}
            </option>
          ))}
        </Field>
      ) : null}

      <Field id={ids.year} label={yearLabel ?? t('time.point.year')} error={errors.year}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            type="number"
            step="1"
            min={reckonsInEras ? 1 : undefined}
            inputMode="numeric"
            placeholder={t('time.point.yearPlaceholder')}
            value={value.year}
            onChange={(event) => onChange('year', event.target.value)}
            data-testid={ids.year}
          />
        )}
      </Field>

      <Field id={ids.month} label={t('time.point.month')} error={errors.month}>
        {(control) =>
          custom ? (
            <select
              {...control}
              className="field__input field__input--select"
              value={value.month}
              onChange={(event) => {
                onChange('month', event.target.value)
                // A day only means something inside a month, so taking the month away takes the day too.
                if (event.target.value === '') onChange('day', '')
              }}
              data-testid={ids.month}
            >
              <option value="">{t('time.point.noMonth')}</option>
              {chronology.calendar?.months.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {tn('time.point.days', option.dayCount, { n: option.dayCount })}
                </option>
              ))}
            </select>
          ) : (
            <input
              {...control}
              className="field__input"
              type="number"
              step="1"
              min={1}
              max={12}
              inputMode="numeric"
              placeholder={t('time.point.monthPlaceholder')}
              value={value.month}
              onChange={(event) => onChange('month', event.target.value)}
              data-testid={ids.month}
            />
          )
        }
      </Field>

      <Field id={ids.day} label={t('time.point.day')} error={errors.day}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            type="number"
            step="1"
            min={1}
            max={custom ? month?.dayCount : 31}
            inputMode="numeric"
            placeholder={t('time.point.dayPlaceholder')}
            disabled={custom && !month && value.day === ''}
            value={value.day}
            onChange={(event) => onChange('day', event.target.value)}
            data-testid={ids.day}
          />
        )}
      </Field>
    </div>
  )
}
