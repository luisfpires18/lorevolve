import { Field } from './Field'
import { SaveAction } from './SaveAction'
import type { Chronology } from '../chronology/types'
import { t, useI18n } from '../i18n'
import { useLeaveGuard } from '../lib/leaveGuard'
import { draftsFrom, inputOf, type Mode } from '../chronology/monthDrafts'
import { useCalendarEditorState } from '../chronology/useCalendarEditorState'
import { calendarActions } from '../chronology/calendarActions'
import { CalendarMonthRow } from './chronology/CalendarMonthRow'
import { Button } from './Button'
import { NewButton } from './NewButton'
import { Announce } from './Announce'

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
  useI18n()
  const stored = chronology.calendar
  const storedMode: Mode = stored ? 'custom' : 'simple'
  const state = useCalendarEditorState({ stored, storedMode })
  const { mode, drafts, fieldErrors, message, saving, saves, moved, headingId, statusId } = state

  const dirty =
    mode !== storedMode ||
    (mode === 'custom' &&
      JSON.stringify(inputOf(drafts)) !== JSON.stringify(inputOf(draftsFrom(stored))))
  useLeaveGuard(dirty ? t('time.calendar.leaveGuard') : null)

  const { update, add, choose, move, remove, discard, save } = calendarActions({
    ...state,
    universeId,
    onSaved,
    stored,
    storedMode,
  })

  const label =
    mode === 'simple'
      ? t('time.calendar.switchConfirm.confirm')
      : stored
        ? t('time.calendar.save')
        : t('time.calendar.useCustom')

  return (
    <section
      className="chronology calendar"
      aria-labelledby={headingId}
      data-testid="calendar-settings"
    >
      <h2 className="settings__heading" id={headingId}>
        {t('time.calendar.heading')}
      </h2>

      <Field label={t('time.calendar.datesUse')} group className="calendar__mode">
        {(control) => (
          <div className="segmented" {...control} data-testid="calendar-mode">
            <button
              type="button"
              className="segmented__option"
              aria-pressed={mode === 'simple'}
              onClick={() => choose('simple')}
              data-testid="calendar-mode-simple"
            >
              {t('time.calendar.simple')}
            </button>
            <button
              type="button"
              className="segmented__option"
              aria-pressed={mode === 'custom'}
              onClick={() => choose('custom')}
              data-testid="calendar-mode-custom"
            >
              {t('time.calendar.custom')}
            </button>
          </div>
        )}
      </Field>

      {mode === 'simple' ? (
        <p className="settings__note" data-testid="calendar-note">
          {stored ? t('time.calendar.simpleNoteStored') : t('time.calendar.simpleNote')}
        </p>
      ) : (
        <>
          <p className="settings__note" data-testid="calendar-note">
            {stored ? t('time.calendar.customNoteStored') : t('time.calendar.customNote')}
          </p>

          <ol className="months" data-testid="months">
            {drafts.map((month, index) => (
              <CalendarMonthRow
                key={month.key}
                month={month}
                index={index}
                drafts={drafts}
                fieldErrors={fieldErrors}
                update={update}
                move={move}
                remove={remove}
              />
            ))}
          </ol>

          <NewButton tone="secondary" onClick={add} data-testid="add-month">
            {t('time.calendar.add')}
          </NewButton>

          {fieldErrors.months ? <p className="field__error">{fieldErrors.months}</p> : null}
        </>
      )}

      <Announce testId="month-moved">{moved}</Announce>

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
            restingStatus={t('time.calendar.saved')}
            statusId={statusId}
            statusTestId="calendar-status"
            testId="save-calendar"
            type="button"
            onSave={() => void save()}
          />
          {dirty ? (
            <Button tone="secondary" onClick={discard}>
              {t('shell.actions.discard')}
            </Button>
          ) : null}
        </div>
      ) : (
        <Announce testId="calendar-status" id={statusId}>
          {saves > 0 ? t('time.calendar.savedStatus') : ''}
        </Announce>
      )}
    </section>
  )
}
