import { useEffect, useId, useRef, useState } from 'react'
import { ChronologyPointFields, type ChronologyPointPart } from './ChronologyPointFields'
import { EntityMultiPicker, EntityPicker, type EntityChoice } from './EntityPicker'
import { CanonBlockNotice } from './CanonBlockNotice'
import { ValidationTermSelect } from './ValidationTermSelect'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { CANON_LABELS, CANON_ORDER, CanonStatus, type CanonStatusValue } from '../lore/types'
import { ValidationTermKind } from '../ruleValidation/types'
import { useValidationTerms } from '../ruleValidation/useValidationTerms'
import { listStories } from '../stories/api'
import type { StorySummary } from '../stories/types'
import { createTimelineEntry, updateTimelineEntry } from '../timeline/api'
import {
  DATE_KIND_HINTS,
  DATE_KIND_LABELS,
  DATE_KIND_ORDER,
  DateKind,
  type DateKindValue,
  type TimelineEntry,
  type TimelineStoryLink,
} from '../timeline/types'

/**
 * The draft holds every component as a string. An empty number input is genuinely empty
 * rather than zero, and a year of 0 stays distinct from no year at all. An empty era is no
 * era chosen yet.
 */
interface MomentDraft {
  title: string
  description: string
  canonStatus: CanonStatusValue
  dateKind: DateKindValue
  startYear: string
  startMonth: string
  startDay: string
  endYear: string
  endMonth: string
  endDay: string
  startEraId: string
  endEraId: string
  eraLabel: string
  entities: EntityChoice[]
  /** The validation details, each chosen on its own: an event kind and a method by id, and a participant. */
  eventKindId: string
  methodId: string
  participant: EntityChoice | null
  /** The stories it is linked to. One in the Trash stays in the set, marked, so a save never drops it quietly. */
  stories: TimelineStoryLink[]
}

/** The six chronology boxes, named so one handler can serve all of them. */
type ComponentKey = 'startYear' | 'startMonth' | 'startDay' | 'endYear' | 'endMonth' | 'endDay'

type EraKey = 'startEraId' | 'endEraId'

/** The field error keys a refused save's details carry, as the API client lowercases them. */
const DETAIL_ERROR_KEYS = {
  eventKind: 'validation.eventkindid',
  method: 'validation.methodid',
  participant: 'validation.participantentityid',
} as const

const EMPTY: MomentDraft = {
  title: '',
  description: '',
  canonStatus: CanonStatus.Idea,
  dateKind: DateKind.Exact,
  startYear: '',
  startMonth: '',
  startDay: '',
  endYear: '',
  endMonth: '',
  endDay: '',
  startEraId: '',
  endEraId: '',
  eraLabel: '',
  entities: [],
  eventKindId: '',
  methodId: '',
  participant: null,
  stories: [],
}

function numberText(value: number | null) {
  return value === null ? '' : String(value)
}

function draftFrom(entry: TimelineEntry): MomentDraft {
  const details = entry.validation

  return {
    title: entry.title,
    description: entry.description ?? '',
    canonStatus: entry.canonStatus,
    dateKind: entry.date.kind,
    startYear: numberText(entry.date.startYear),
    // A custom calendar's month is held by its id; a simple month by its number.
    startMonth: entry.date.startMonthId ?? numberText(entry.date.startMonth),
    startDay: numberText(entry.date.startDay),
    endYear: numberText(entry.date.endYear),
    endMonth: entry.date.endMonthId ?? numberText(entry.date.endMonth),
    endDay: numberText(entry.date.endDay),
    startEraId: entry.date.startEraId ?? '',
    endEraId: entry.date.endEraId ?? '',
    eraLabel: entry.date.eraLabel ?? '',
    // A participant in the Trash keeps its place in the set - the form posts every id back,
    // so dropping it here would delete the participation on the next save. It is labelled
    // instead, so the author can see why it is not clickable anywhere else.
    entities: entry.entities.map((link) => ({
      id: link.entityId,
      name: link.isTrashed ? `${link.name} (in Trash)` : link.name,
    })),
    eventKindId: details?.eventKind?.id ?? '',
    methodId: details?.method?.id ?? '',
    participant: details?.participant
      ? {
          id: details.participant.entityId,
          name: details.participant.isTrashed
            ? `${details.participant.name} (in Trash)`
            : details.participant.name,
        }
      : null,
    stories: entry.stories,
  }
}

/** An empty box is no claim at all; anything unreadable is left for the API to refuse. */
function toNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

interface TimelineEntryFormProps {
  universeId: string
  /** The moment being changed, or null when one is being written for the first time. */
  entry: TimelineEntry | null
  /** How this universe keeps time. With eras, every dated moment says which one it is in. */
  chronology: Chronology
  /** The stories a new moment starts linked to: the story whose timeline it was started from. Ignored for an existing one. */
  initialStories?: TimelineStoryLink[]
  onClose: () => void
  onSaved: () => void
}

/**
 * A drawer over the chronology rather than a page of its own: the moments stay visible
 * behind it, so an author can see where the one they are writing will land.
 *
 * Only the components the chosen kind allows are shown, and switching kind clears the
 * ones it forbids, so the form can never send a shape the API is bound to refuse.
 *
 * On a universe that names its eras, each year is chosen with its era beside it and the
 * free-text label of the plain reckoning is gone. On one that names none, the form is exactly
 * what it always was.
 *
 * Validation details sit folded at the foot (ADR 0034): an ordinary moment never needs them, and nothing in them is filled in
 * from the title, the description or who took part.
 */
/**
 * The draft as the save sends it: a kind carries only its own date parts, a universe with eras no free label, and a
 * universe with a custom calendar its months by id rather than by number.
 */
function inputOf(draft: MomentDraft, reckonsInEras: boolean, custom: boolean) {
  const isDatedKind = draft.dateKind !== DateKind.Unknown
  const isRangeKind = draft.dateKind === DateKind.Range

  return {
    title: draft.title.trim(),
    description: trimmed(draft.description),
    canonStatus: draft.canonStatus,
    dateKind: draft.dateKind,
    startYear: toNumber(draft.startYear),
    startMonth: custom ? null : toNumber(draft.startMonth),
    startMonthId: custom ? trimmed(draft.startMonth) : null,
    startDay: toNumber(draft.startDay),
    endYear: toNumber(draft.endYear),
    endMonth: custom ? null : toNumber(draft.endMonth),
    endMonthId: custom ? trimmed(draft.endMonth) : null,
    endDay: toNumber(draft.endDay),
    // A universe with eras has no free-text label; one without has no eras to send.
    eraLabel: reckonsInEras ? null : trimmed(draft.eraLabel),
    startEraId: reckonsInEras && isDatedKind ? trimmed(draft.startEraId) : null,
    endEraId: reckonsInEras && isRangeKind ? trimmed(draft.endEraId) : null,
    entityIds: draft.entities.map((choice) => choice.id),
    // Always sent whole, a story in the Trash included; an empty list unlinks every story.
    storyIds: draft.stories.map((story) => story.storyId),
    // Always sent whole: all three empty removes the details.
    validation: {
      eventKindId: trimmed(draft.eventKindId),
      methodId: trimmed(draft.methodId),
      participantEntityId: draft.participant?.id ?? null,
    },
  }
}

export function TimelineEntryForm({
  universeId,
  entry,
  chronology,
  initialStories = [],
  onClose,
  onSaved,
}: TimelineEntryFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the moment as stored, or the blank form - which the draft is measured against.
  const [initial] = useState<MomentDraft>(() =>
    entry ? draftFrom(entry) : { ...EMPTY, stories: initialStories },
  )
  const [draft, setDraft] = useState<MomentDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => entry?.validation != null)
  const {
    terms,
    failed: termsFailed,
    add: addTerm,
    reload: reloadTerms,
  } = useValidationTerms(universeId)

  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const isDirty =
    payloadKey(inputOf(draft, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, reckonsInEras, custom))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    entry
      ? `“${entry.title}” has unsaved changes. Leave without saving them?`
      : 'This new moment has not been added. Leave without saving it?',
    onClose,
  )

  useEffect(() => {
    // showModal, not the open attribute: it brings the focus trap, the backdrop and
    // Escape with it rather than leaving them to be rebuilt here.
    dialog.current?.showModal()

    // Left alone, the browser hands the focus to the scrolling body, which then wears a
    // focus ring across the whole panel. The title is where the writing starts anyway.
    title.current?.focus()
  }, [])

  function edit(change: Partial<MomentDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function setComponent(key: ComponentKey | EraKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  /** A kind only carries its own components, so the others are dropped as it changes. */
  function chooseKind(dateKind: DateKindValue) {
    if (dateKind === DateKind.Unknown) {
      edit({
        dateKind,
        startYear: '',
        startMonth: '',
        startDay: '',
        endYear: '',
        endMonth: '',
        endDay: '',
        startEraId: '',
        endEraId: '',
      })
    } else if (dateKind === DateKind.Range) {
      edit({ dateKind })
    } else {
      edit({ dateKind, endYear: '', endMonth: '', endDay: '', endEraId: '' })
    }
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setIsSaving(true)

    const input = inputOf(draft, reckonsInEras, custom)

    try {
      if (entry) {
        await updateTimelineEntry(universeId, entry.id, input)
      } else {
        await createTimelineEntry(universeId, input)
      }
      onSaved()
    } catch (error: unknown) {
      // The gate's refusal is its own thing: the draft below is intact and the only
      // useful thing to say is what disagreed with it.
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.values(DETAIL_ERROR_KEYS).some((key) => error.fieldErrors[key])) {
          setDetailsOpen(true)
        }
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That moment could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const isRange = draft.dateKind === DateKind.Range
  const isDated = draft.dateKind !== DateKind.Unknown
  const detailCount = [draft.eventKindId, draft.methodId, draft.participant].filter(Boolean).length

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
          prefix === 'start' ? (isRange ? 'Starts in period' : 'Date period') : 'Ends in period'
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
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="moment-heading"
      {...dialogProps}
      data-testid="moment-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {/* A new moment's title already says so; the eyebrow names only what is being edited. */}
          {entry ? <p className="drawer__eyebrow">Editing a moment</p> : null}
          <h2 className="drawer__title" id="moment-heading">
            {entry ? entry.title || 'Untitled moment' : 'New moment'}
          </h2>
        </header>

        <div className="drawer__body">
          {blocked ? (
            <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
          ) : null}

          {message ? (
            <p className="form__message" role="alert" data-testid="moment-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="moment-title">
              Title
            </label>
            <input
              id="moment-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="Insert a title"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="moment-title"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="moment-description">
              What happened
            </label>
            <textarea
              id="moment-description"
              className="field__input field__input--area"
              rows={3}
              placeholder="A sentence or two, for the reader who has forgotten."
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
              data-testid="moment-description"
            />
            {fieldErrors.description ? (
              <p className="field__error">{fieldErrors.description}</p>
            ) : null}
          </div>

          <div className="field">
            <span className="field__label">Status</span>
            <div className="canon" role="group" aria-label="Moment status">
              {CANON_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="canon__step"
                  aria-pressed={draft.canonStatus === option}
                  onClick={() => edit({ canonStatus: option })}
                  data-testid={`moment-canon-${CANON_LABELS[option].toLowerCase()}`}
                >
                  {CANON_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">When</span>
            <div className="segmented" role="group" aria-label="How the date is known">
              {DATE_KIND_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="segmented__option"
                  aria-pressed={draft.dateKind === option}
                  onClick={() => chooseKind(option)}
                  data-testid={`moment-kind-${DATE_KIND_LABELS[option].toLowerCase()}`}
                >
                  {DATE_KIND_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="field__hint">{DATE_KIND_HINTS[draft.dateKind]}</p>
            {fieldErrors.datekind ? <p className="field__error">{fieldErrors.datekind}</p> : null}
          </div>

          {isDated ? (
            <>
              {point('start', isRange ? 'Starts in year' : 'Year', {
                era: fieldErrors.starteraid,
                year: fieldErrors.startyear,
                month: fieldErrors.startmonth,
                day: fieldErrors.startday,
              })}

              {isRange
                ? point('end', 'Ends in year', {
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
                Labelled &ldquo;<bdi>{draft.eraLabel}</bdi>&rdquo; before this universe had date
                periods. Choose its period above; the old label is dropped when you save.
              </p>
            ) : null
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="moment-era">
                Year label
              </label>
              <p className="field__hint">
                Optional text shown beside the year: AC, Before the Flood. LorEvolve does not order
                by it. To order dates by named periods, add date periods in Chronology.
              </p>
              <input
                id="moment-era"
                className="field__input"
                type="text"
                placeholder="Optional"
                value={draft.eraLabel}
                onChange={(event) => edit({ eraLabel: event.target.value })}
                aria-invalid={fieldErrors.eralabel ? true : undefined}
                data-testid="moment-era"
              />
              {fieldErrors.eralabel ? <p className="field__error">{fieldErrors.eralabel}</p> : null}
            </div>
          )}

          <EntityMultiPicker
            label="Who and what took part"
            hint="Anything in this universe: a character, a place, an object."
            universeId={universeId}
            value={draft.entities}
            onChange={(entities) => edit({ entities })}
            error={fieldErrors.entityids}
          />

          <StoryLinks
            universeId={universeId}
            value={draft.stories}
            onChange={(stories) => edit({ stories })}
            error={fieldErrors.storyids}
          />

          <details
            className="moment__details"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            data-testid="moment-validation"
          >
            <summary data-testid="moment-validation-toggle">
              Validation details
              {detailCount > 0 ? (
                <span className="moment__detailscount"> · {detailCount} set</span>
              ) : (
                <span className="moment__detailscount"> · optional</span>
              )}
            </summary>

            <div className="moment__detailsbody">
              <p className="field__hint">
                Only World Rules with a timeline check read these, and only these: nothing is taken
                from the title, the description or who took part. Most moments need none.
              </p>

              {termsFailed ? (
                <p className="form__message" role="alert">
                  The event kinds and methods could not be read.{' '}
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    onClick={reloadTerms}
                  >
                    Try again
                  </button>
                </p>
              ) : null}

              <ValidationTermSelect
                universeId={universeId}
                kind={ValidationTermKind.EventKind}
                label="Event kind"
                terms={terms}
                value={draft.eventKindId}
                selectedName={
                  entry?.validation?.eventKind?.id === draft.eventKindId
                    ? entry.validation.eventKind.name
                    : null
                }
                emptyLabel="None"
                onChange={(eventKindId) => edit({ eventKindId })}
                onCreated={addTerm}
                error={fieldErrors[DETAIL_ERROR_KEYS.eventKind]}
                testId="moment-event-kind"
              />

              <ValidationTermSelect
                universeId={universeId}
                kind={ValidationTermKind.Method}
                label="Method"
                terms={terms}
                value={draft.methodId}
                selectedName={
                  entry?.validation?.method?.id === draft.methodId
                    ? entry.validation.method.name
                    : null
                }
                emptyLabel="None"
                onChange={(methodId) => edit({ methodId })}
                onCreated={addTerm}
                error={fieldErrors[DETAIL_ERROR_KEYS.method]}
                testId="moment-method"
              />

              <EntityPicker
                label="Participant"
                universeId={universeId}
                value={draft.participant}
                onChange={(participant) => edit({ participant })}
                placeholder="Whose event this is"
                error={fieldErrors[DETAIL_ERROR_KEYS.participant]}
              />
            </div>
          </details>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-moment">
            {isSaving ? 'Saving' : entry ? 'Save moment' : 'Create moment'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-moment"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}

/**
 * The stories a moment matters to: each linked one as a token with Remove, and a choice of the universe's other live stories to
 * add. The story list is read once, when the drawer opens - a universe holds a handful of stories and the list is unpaged for
 * that reason - and the linked ones are named from the moment itself, so showing them never waits on it. A story in the Trash
 * stays linked and says so; it is never offered.
 */
function StoryLinks({
  universeId,
  value,
  onChange,
  error,
}: {
  universeId: string
  value: TimelineStoryLink[]
  onChange: (stories: TimelineStoryLink[]) => void
  error?: string
}) {
  const selectId = useId()
  const hintId = useId()
  const errorId = useId()
  const [stories, setStories] = useState<StorySummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

  const linked = new Set(value.map((story) => story.storyId))
  const offered = (stories ?? []).filter((story) => !linked.has(story.id))

  return (
    <div className="field storylinks" data-testid="moment-stories">
      <label className="field__label" htmlFor={selectId}>
        Stories
      </label>
      <p className="field__hint" id={hintId}>
        Link this moment to the stories it matters to. It shows up on their timelines too.
      </p>

      {value.length > 0 ? (
        <ul className="storylinks__list">
          {value.map((story) => (
            <li className="token" key={story.storyId} data-testid="moment-story">
              <bdi>{story.title}</bdi>
              {story.isTrashed ? <span className="token__note"> (in Trash)</span> : null}
              <button
                type="button"
                className="token__remove"
                aria-label={`Unlink ${story.title}`}
                onClick={() => onChange(value.filter((one) => one.storyId !== story.storyId))}
                data-testid={`moment-story-remove-${story.title}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <select
        id={selectId}
        className="field__input field__input--select"
        value=""
        disabled={stories === null || offered.length === 0}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const story = offered.find((one) => one.id === event.target.value)
          if (story)
            onChange([...value, { storyId: story.id, title: story.title, isTrashed: false }])
        }}
        data-testid="moment-story-add"
      >
        <option value="">
          {failed
            ? 'Stories could not be read'
            : stories === null
              ? 'Reading stories…'
              : offered.length === 0
                ? stories.length === 0
                  ? 'No stories yet'
                  : 'Every story is linked'
                : 'Link a story…'}
        </option>
        {offered.map((story) => (
          <option key={story.id} value={story.id}>
            {story.title}
          </option>
        ))}
      </select>

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
