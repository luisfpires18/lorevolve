import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { SaveAction } from './SaveAction'
import { removeCalendar, saveCalendar } from '../chronology/api'
import type {
  Chronology,
  ChronologyCalendar,
  ChronologyCalendarMonthInput,
} from '../chronology/types'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { confirmAction, confirmDiscard } from '../lib/confirm'

type Mode = 'simple' | 'custom'

/** One month as it is being edited. Days stay text until sent, so an emptied box is empty rather than zero. */
interface MonthDraft {
  /** Stable across reordering, so React keeps each row's inputs with its month. */
  key: string
  id: string | null
  name: string
  abbreviation: string
  days: string
  useCount: number
  maxDayUsed: number | null
}

function draftsFrom(calendar: ChronologyCalendar | null): MonthDraft[] {
  return (calendar?.months ?? []).map((month) => ({
    key: month.id,
    id: month.id,
    name: month.name,
    abbreviation: month.abbreviation ?? '',
    days: String(month.dayCount),
    useCount: month.useCount,
    maxDayUsed: month.maxDayUsed,
  }))
}

function inputOf(drafts: MonthDraft[]): ChronologyCalendarMonthInput[] {
  return drafts.map((month) => ({
    id: month.id,
    name: month.name.trim(),
    abbreviation: month.abbreviation.trim() || null,
    dayCount: Number(month.days.trim() || 0),
  }))
}

/** Said only when it matters: a new month, or one dates still use. A saved month nothing uses needs no line of its own. */
function usageOf(month: MonthDraft) {
  if (!month.id) return 'New, not saved yet'
  if (month.useCount === 0) return null
  const dates = month.useCount === 1 ? 'Used by 1 date' : `Used by ${month.useCount} dates`
  return month.maxDayUsed ? `${dates}, up to day ${month.maxDayUsed}` : dates
}

interface CalendarEditorProps {
  universeId: string
  chronology: Chronology
  onSaved: (next: Chronology) => void
}

/**
 * How a universe's year is divided: simple numbered months and days, or a custom calendar of the author's own months. One
 * section of the Chronology page, beside the date periods, with a save of its own: the API keeps the two writes apart, so
 * saving one never clears the other.
 *
 * Simple dates are the default and stay out of the way: a short note, and nothing to fill in. Choosing a custom calendar
 * opens the month list; a first save turns it on and moves every date's month to the month in the same place. After that
 * the whole list is saved at once, so renaming, reordering, adding and removing months is one change. A month in use cannot
 * be removed or shortened below a day in use, and says so on the row; anything the server refuses - a date that no longer
 * fits, a range a new order would turn around - comes back as one plain sentence under the list.
 */
export function CalendarEditor({ universeId, chronology, onSaved }: CalendarEditorProps) {
  const stored = chronology.calendar
  const storedMode: Mode = stored ? 'custom' : 'simple'
  const [mode, setMode] = useState<Mode>(storedMode)
  const [drafts, setDrafts] = useState(() => draftsFrom(stored))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [moved, setMoved] = useState('')
  const headingId = useId()
  const modeId = useId()
  const statusId = useId()
  const touched = useRef(false)
  const created = useRef(0)
  const focusNew = useRef<string | null>(null)

  // The workspace's chronology can be read again under this screen - the date periods' editor does on opening - and an
  // untouched calendar follows it.
  useEffect(() => {
    if (touched.current) return
    setMode(stored ? 'custom' : 'simple')
    setDrafts(draftsFrom(stored))
  }, [stored])

  useEffect(() => {
    if (!focusNew.current) return
    document.getElementById(focusNew.current)?.focus()
    focusNew.current = null
  }, [drafts])

  const dirty =
    mode !== storedMode ||
    (mode === 'custom' &&
      JSON.stringify(inputOf(drafts)) !== JSON.stringify(inputOf(draftsFrom(stored))))
  useLeaveGuard(dirty ? 'The calendar has unsaved changes. Leave without saving them?' : null)

  function change(next: MonthDraft[]) {
    touched.current = true
    setDrafts(next)
  }

  function update(index: number, part: Partial<MonthDraft>) {
    change(drafts.map((month, position) => (position === index ? { ...month, ...part } : month)))
  }

  function newMonth(): MonthDraft {
    created.current += 1
    return {
      key: `new-${created.current}`,
      id: null,
      name: '',
      abbreviation: '',
      days: '30',
      useCount: 0,
      maxDayUsed: null,
    }
  }

  function add() {
    const month = newMonth()
    focusNew.current = `month-${month.key}-name`
    change([...drafts, month])
  }

  function choose(next: Mode) {
    touched.current = true
    setMode(next)
    setMessage(null)
    setFieldErrors({})
    // A custom calendar starts with one month to name, rather than an empty list to puzzle over.
    if (next === 'custom' && drafts.length === 0) {
      const month = newMonth()
      focusNew.current = `month-${month.key}-name`
      setDrafts([month])
    }
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= drafts.length) return
    const next = [...drafts]
    const [month] = next.splice(index, 1)
    next.splice(to, 0, month)
    change(next)
    setMoved(`${month.name.trim() || 'New month'} is now ${to + 1} of ${next.length}.`)
  }

  function remove(index: number) {
    const month = drafts[index]
    // A calendar keeps at least one month; to have none is simple dates, chosen above.
    if (month.useCount > 0 || drafts.length === 1) return
    change(drafts.filter((_, position) => position !== index))
    setMoved(`${month.name.trim() || 'New month'} removed.`)
  }

  async function discard() {
    if (!(await confirmDiscard('Discard your changes to the calendar?'))) return
    touched.current = false
    setMode(storedMode)
    setDrafts(draftsFrom(stored))
    setFieldErrors({})
    setMessage(null)
  }

  async function save() {
    if (
      mode === 'simple' &&
      !(await confirmAction({
        title: 'Switch to simple dates?',
        message:
          'This removes month names and lengths. Each date keeps its month as a number: its place in the year.',
        confirmLabel: 'Switch to simple dates',
        variant: 'destructive',
      }))
    ) {
      return
    }

    setSaving(true)
    setMessage(null)
    setFieldErrors({})

    try {
      const next =
        mode === 'custom'
          ? await saveCalendar(universeId, inputOf(drafts))
          : await removeCalendar(universeId)
      touched.current = false
      setMode(next.calendar ? 'custom' : 'simple')
      setDrafts(draftsFrom(next.calendar))
      onSaved(next)
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0 || error.fieldErrors.months
            ? error.message
            : 'Some months need a change before this can be saved.',
        )
      } else {
        setMessage('The calendar could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  const label =
    mode === 'simple' ? 'Switch to simple dates' : stored ? 'Save calendar' : 'Use custom calendar'

  return (
    <section
      className="chronology calendar"
      aria-labelledby={headingId}
      data-testid="calendar-settings"
    >
      <h2 className="settings__heading" id={headingId}>
        Calendar
      </h2>

      <div className="field calendar__mode">
        <span className="field__label" id={modeId}>
          Dates use
        </span>
        <div
          className="segmented"
          role="group"
          aria-labelledby={modeId}
          data-testid="calendar-mode"
        >
          <button
            type="button"
            className="segmented__option"
            aria-pressed={mode === 'simple'}
            onClick={() => choose('simple')}
            data-testid="calendar-mode-simple"
          >
            Simple dates
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={mode === 'custom'}
            onClick={() => choose('custom')}
            data-testid="calendar-mode-custom"
          >
            Custom calendar
          </button>
        </div>
      </div>

      {mode === 'simple' ? (
        <p className="settings__note" data-testid="calendar-note">
          {stored
            ? 'Each date keeps its month as a number: its place in the year. This works only while every date fits 12 months of up to 31 days.'
            : 'Months and days are numbers: months 1 to 12, days 1 to 31. Choose a custom calendar if your world names its own months.'}
        </p>
      ) : (
        <>
          <p className="settings__note" data-testid="calendar-note">
            {stored
              ? 'The months of one year, earliest first. Dates stay with their month when you rename or move it. A month that a date uses can’t be removed.'
              : 'Name the months of one year, in order, and give each its number of days. When you save, any date that already has a month moves to the month in the same place: month 3 becomes your third month.'}
          </p>

          <ol className="months" data-testid="months">
            {drafts.map((month, index) => {
              const prefix = `months[${index}]`
              const base = `month-${month.key}`
              const name = month.name.trim() || 'new month'
              const inUse = month.useCount > 0
              const usage = usageOf(month)
              const useId = usage ? `${base}-use` : undefined
              const first = index === 0
              const last = index === drafts.length - 1
              const nameError = fieldErrors[`${prefix}.name`]
              const shortError = fieldErrors[`${prefix}.abbreviation`]
              const daysError = fieldErrors[`${prefix}.daycount`]

              return (
                <li className="month" key={month.key} data-testid="month">
                  <span className="month__ordinal" aria-hidden="true">
                    {index + 1}
                  </span>

                  <div className="month__fields">
                    <div className="field">
                      <label className="field__label" htmlFor={`${base}-name`}>
                        Name
                      </label>
                      <input
                        id={`${base}-name`}
                        className="field__input"
                        placeholder="Insert a name"
                        autoComplete="off"
                        value={month.name}
                        onChange={(event) => update(index, { name: event.target.value })}
                        aria-invalid={nameError ? true : undefined}
                        aria-describedby={nameError ? `${base}-name-error` : undefined}
                        data-testid="month-name"
                      />
                      {nameError ? (
                        <p className="field__error" id={`${base}-name-error`}>
                          {nameError}
                        </p>
                      ) : null}
                    </div>

                    <div className="field">
                      <label className="field__label" htmlFor={`${base}-short`}>
                        Short name
                      </label>
                      <input
                        id={`${base}-short`}
                        className="field__input"
                        placeholder="Optional"
                        autoComplete="off"
                        value={month.abbreviation}
                        onChange={(event) => update(index, { abbreviation: event.target.value })}
                        aria-invalid={shortError ? true : undefined}
                        aria-describedby={shortError ? `${base}-short-error` : undefined}
                        data-testid="month-abbreviation"
                      />
                      {shortError ? (
                        <p className="field__error" id={`${base}-short-error`}>
                          {shortError}
                        </p>
                      ) : null}
                    </div>

                    <div className="field month__days">
                      <label className="field__label" htmlFor={`${base}-days`}>
                        Days
                      </label>
                      <input
                        id={`${base}-days`}
                        className="field__input"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={Math.max(1, month.maxDayUsed ?? 1)}
                        max={1000}
                        value={month.days}
                        onChange={(event) => update(index, { days: event.target.value })}
                        aria-invalid={daysError ? true : undefined}
                        aria-describedby={
                          [useId, daysError ? `${base}-days-error` : undefined]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        data-testid="month-days"
                      />
                      {daysError ? (
                        <p className="field__error" id={`${base}-days-error`}>
                          {daysError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="month__tools">
                    <button
                      className="iconbutton"
                      type="button"
                      onClick={() => move(index, -1)}
                      aria-disabled={first ? true : undefined}
                      aria-label={`Move ${name} earlier`}
                      title="Earlier"
                      data-testid="month-earlier"
                    >
                      <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    </button>
                    <button
                      className="iconbutton"
                      type="button"
                      onClick={() => move(index, 1)}
                      aria-disabled={last ? true : undefined}
                      aria-label={`Move ${name} later`}
                      title="Later"
                      data-testid="month-later"
                    >
                      <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    </button>
                    <button
                      className="iconbutton"
                      type="button"
                      onClick={() => remove(index)}
                      aria-disabled={inUse || drafts.length === 1 ? true : undefined}
                      aria-label={`Remove ${name}`}
                      aria-describedby={inUse ? `${useId} ${base}-keep` : undefined}
                      title={inUse ? 'In use. Change its dates before removing it.' : 'Remove'}
                      data-testid="month-remove"
                    >
                      <X aria-hidden="true" focusable="false" strokeWidth={1.75} />
                    </button>
                    {inUse ? (
                      <span className="visually-hidden" id={`${base}-keep`}>
                        In use. Change its dates before removing it.
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
            })}
          </ol>

          <button
            className="button button--secondary"
            type="button"
            onClick={add}
            data-testid="add-month"
          >
            <ActionIcon icon={Plus} />
            Add month
          </button>

          {fieldErrors.months ? <p className="field__error">{fieldErrors.months}</p> : null}
        </>
      )}

      <p className="visually-hidden" role="status" data-testid="month-moved">
        {moved}
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="calendar-error">
          {message}
        </p>
      ) : null}

      {/* Simple dates with nothing to change have nothing to save, so no lone quiet button sits under the note. */}
      {dirty || mode === 'custom' ? (
        <div className="form__actions eras__actions">
          <SaveAction
            label={label}
            isDirty={dirty}
            isSaving={saving}
            saves={saves}
            restingStatus="Saved"
            statusId={statusId}
            statusTestId="calendar-status"
            testId="save-calendar"
            type="button"
            onSave={() => void save()}
          />
          {dirty ? (
            <button className="button button--secondary" type="button" onClick={discard}>
              Discard changes
            </button>
          ) : null}
        </div>
      ) : (
        <p className="visually-hidden" id={statusId} role="status" data-testid="calendar-status">
          {saves > 0 ? 'Calendar saved.' : ''}
        </p>
      )}
    </section>
  )
}
