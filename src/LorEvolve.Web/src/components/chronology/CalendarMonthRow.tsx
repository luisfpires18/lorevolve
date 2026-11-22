import { X } from 'lucide-react'
import { Field } from '../Field'
import { t, tn, useI18n } from '../../i18n'
import type { ChronologyCalendarMonth } from '../../chronology/types'
import { usageOf, type MonthDraft } from '../../chronology/monthDrafts'
import { IconButton } from '../IconButton'
import { MoveItems } from '../MoveItems'

/** One month of a custom calendar: name, short name, days, Earlier, Later, Remove and the use line. */
export function CalendarMonthRow({
  month,
  index,
  drafts,
  fieldErrors,
  update,
  move,
  remove,
}: {
  month: MonthDraft
  index: number
  drafts: MonthDraft[]
  fieldErrors: Record<string, string>
  update: (index: number, part: Partial<MonthDraft>) => void
  move: (index: number, by: -1 | 1) => void
  remove: (index: number) => void
}) {
  useI18n()
  const prefix = `months[${index}]`
  const base = `month-${month.key}`
  const name = month.name.trim() || t('time.calendar.newMonthLower')
  const inUse = month.useCount > 0
  const usage = usageOf(month)
  const useId = usage ? `${base}-use` : undefined
  const first = index === 0
  const last = index === drafts.length - 1
  const nameError = fieldErrors[`${prefix}.name`]
  const shortError = fieldErrors[`${prefix}.abbreviation`]
  const daysError = fieldErrors[`${prefix}.daycount`]

  return (
    <li className="month" data-testid="month">
      <span className="month__ordinal" aria-hidden="true">
        {index + 1}
      </span>

      <div className="month__fields">
        <Field
          name={null}
          label={t('time.calendar.name')}
          id={`${base}-name`}
          error={nameError}
          placeholder={t('time.calendar.namePlaceholder')}
          autoComplete="off"
          value={month.name}
          onChange={(event) => update(index, { name: event.target.value })}
          data-testid="month-name"
        />

        <Field
          name={null}
          label={t('time.calendar.shortName')}
          id={`${base}-short`}
          error={shortError}
          placeholder={t('time.calendar.optional')}
          autoComplete="off"
          value={month.abbreviation}
          onChange={(event) => update(index, { abbreviation: event.target.value })}
          data-testid="month-abbreviation"
        />

        <Field
          name={null}
          label={t('time.calendar.days')}
          id={`${base}-days`}
          error={daysError}
          className="month__days"
          type="number"
          inputMode="numeric"
          step="1"
          min={Math.max(1, month.maxDayUsed ?? 1)}
          max={1000}
          value={month.days}
          onChange={(event) => update(index, { days: event.target.value })}
          aria-describedby={useId}
          data-testid="month-days"
        />
      </div>

      <div className="month__tools">
        <MoveItems
          look="icon"
          wording="earlier-later"
          name={name}
          first={first}
          last={last}
          testIds={{ up: 'month-earlier', down: 'month-later' }}
          onMove={(step) => move(index, step)}
        />
        <IconButton
          icon={X}
          label={t('time.calendar.removeNamed', { name })}
          title={inUse ? t('time.calendar.inUse') : t('time.calendar.remove')}
          onClick={() => remove(index)}
          aria-disabled={inUse || drafts.length === 1 ? true : undefined}
          aria-describedby={inUse ? `${useId} ${base}-keep` : undefined}
          data-testid="month-remove"
        />
        {inUse ? (
          <span className="visually-hidden" id={`${base}-keep`}>
            {t('time.calendar.inUse')}
          </span>
        ) : null}
      </div>

      {usage ? (
        <p className="month__use" id={useId} data-testid="month-use">
          {usage}
        </p>
      ) : null}
    </li>
  )
}

/** One month of a custom calendar as a reader sees it: its place, name and length in days. */
export function CalendarMonthReadingRow({
  month,
  index,
}: {
  month: ChronologyCalendarMonth
  index: number
}) {
  useI18n()
  return (
    <li className="month month--reading" data-testid="month-reading">
      <span className="month__ordinal" aria-hidden="true">
        {index + 1}
      </span>
      <bdi className="month__readname">{month.name}</bdi>
      <span className="month__use">
        {tn('time.chronology.reading.days', month.dayCount, { n: month.dayCount })}
      </span>
    </li>
  )
}
