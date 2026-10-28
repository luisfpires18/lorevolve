import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import { savePublication } from '../publishing/api'
import {
  CATEGORIES,
  GENRES,
  MAX_GENRES,
  ORIGINAL_CREATOR_MAX,
  ORIGINAL_WORK_MAX,
  PUBLIC_SUMMARY_MAX,
  type CategoryValue,
  type GenreValue,
  type PublicationDetails,
  type PublicationState,
} from '../publishing/types'

/** Whether a universe says it is based on someone else's work, and whose (ADR 0039), as the form holds it. */
interface Attribution {
  based: boolean
  creator: string
  work: string
}

function attributionOf(state: PublicationState): Attribution {
  return {
    based: state.originalCreator !== null,
    creator: state.originalCreator ?? '',
    work: state.originalWork ?? '',
  }
}

/**
 * The details as a save sends them: trimmed, blank as none, genres in their one order. A world of the author's own sends
 * no attribution at all, so nothing typed before the box was unticked is stored or published.
 */
function detailsOf(
  summary: string,
  category: string,
  genres: GenreValue[],
  attribution: Attribution,
): PublicationDetails {
  return {
    publicSummary: summary.trim() || null,
    category: category === '' ? null : (Number(category) as CategoryValue),
    genres: GENRES.map((genre) => genre.value).filter((value) => genres.includes(value)),
    basedOnExternalWork: attribution.based,
    originalCreator: attribution.based ? attribution.creator.trim() || null : null,
    originalWork: attribution.based ? attribution.work.trim() || null : null,
  }
}

/**
 * The public details a universe is published with: its summary, its category and its genres. Its own form and
 * its own save, apart from the universe's details above it, because what it writes is what the public portal
 * shows - and a summary is never taken from the description.
 *
 * Guarded like every authored draft (`useLeaveGuard`): unsaved is the details as they would be sent against the
 * ones last saved, so a change put back is none; a failed save keeps both the draft and the question; a saved one
 * becomes the new baseline. `onDirtyChange` tells the section, which will not publish over unsaved details.
 */
export function PublicDetailsForm({
  universeId,
  state,
  onSaved,
  onDirtyChange,
}: {
  universeId: string
  state: PublicationState
  onSaved: (next: PublicationState) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const summaryId = useId()
  const summaryHintId = useId()
  const categoryId = useId()
  const genresHintId = useId()
  const creatorId = useId()
  const creatorHintId = useId()
  const creatorErrorId = useId()
  const workId = useId()
  const workErrorId = useId()

  const [summary, setSummary] = useState(state.publicSummary ?? '')
  const [category, setCategory] = useState(state.category === null ? '' : String(state.category))
  const [genres, setGenres] = useState<GenreValue[]>(state.genres)
  const [attribution, setAttribution] = useState<Attribution>(() => attributionOf(state))
  const [saved, setSaved] = useState(() =>
    payloadKey(
      detailsOf(
        state.publicSummary ?? '',
        String(state.category ?? ''),
        state.genres,
        attributionOf(state),
      ),
    ),
  )
  const [isSaving, setIsSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const details = detailsOf(summary, category, genres, attribution)
  const isDirty = !isSaving && payloadKey(details) !== saved

  useLeaveGuard(
    isDirty ? 'The public details have unsaved changes. Leave without saving them?' : null,
  )

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  function toggleGenre(value: GenreValue, chosen: boolean) {
    setSavedMessage(false)
    setGenres((current) =>
      chosen ? [...current, value] : current.filter((genre) => genre !== value),
    )
  }

  function attribute(change: Partial<Attribution>) {
    setSavedMessage(false)
    setAttribution((current) => ({ ...current, ...change }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    setSavedMessage(false)

    // Said here, beside its field, before a request: the server refuses the same.
    if (details.basedOnExternalWork && !details.originalCreator) {
      setFieldErrors({
        originalcreator: 'Name the original creator or source this universe is based on.',
      })
      document.getElementById(creatorId)?.focus()
      return
    }

    setIsSaving(true)

    try {
      const next = await savePublication(universeId, details)
      const nextAttribution = attributionOf(next)
      setSaved(
        payloadKey(
          detailsOf(
            next.publicSummary ?? '',
            String(next.category ?? ''),
            next.genres,
            nextAttribution,
          ),
        ),
      )
      setSummary(next.publicSummary ?? '')
      setAttribution(nextAttribution)
      setSavedMessage(true)
      onSaved(next)
    } catch (error: unknown) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors(error.fieldErrors)
      } else {
        setMessage(
          error instanceof Error ? error.message : 'The public details could not be saved.',
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  const atLimit = genres.length >= MAX_GENRES

  return (
    <form
      className="form publication__form"
      onSubmit={submit}
      noValidate
      data-testid="public-details"
    >
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor={summaryId}>
          Public summary
        </label>
        <textarea
          id={summaryId}
          className="field__input field__input--area"
          rows={3}
          maxLength={PUBLIC_SUMMARY_MAX}
          value={summary}
          aria-describedby={summaryHintId}
          aria-invalid={fieldErrors.publicsummary ? true : undefined}
          onChange={(event) => {
            setSavedMessage(false)
            setSummary(event.target.value)
          }}
          data-testid="public-summary"
        />
        <p className="field__hint" id={summaryHintId}>
          A few sentences for the world&rsquo;s card and public page, up to {PUBLIC_SUMMARY_MAX}{' '}
          characters. The description above is never published. {summary.trim().length}/
          {PUBLIC_SUMMARY_MAX}
        </p>
        {fieldErrors.publicsummary ? (
          <p className="field__error" role="alert">
            {fieldErrors.publicsummary}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={categoryId}>
          Category
        </label>
        <select
          id={categoryId}
          className="field__input field__input--select"
          value={category}
          aria-invalid={fieldErrors.category ? true : undefined}
          onChange={(event) => {
            setSavedMessage(false)
            setCategory(event.target.value)
          }}
          data-testid="public-category"
        >
          <option value="">Choose a category</option>
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldErrors.category ? (
          <p className="field__error" role="alert">
            {fieldErrors.category}
          </p>
        ) : null}
      </div>

      <fieldset className="publication__genres" aria-describedby={genresHintId}>
        <legend className="field__label">Genres</legend>
        <p className="field__hint" id={genresHintId}>
          Choose up to {MAX_GENRES}. {genres.length} chosen.
        </p>
        <div className="publication__genrelist" data-testid="public-genres">
          {GENRES.map((genre) => {
            const chosen = genres.includes(genre.value)
            return (
              <label className="check" key={genre.value}>
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={!chosen && atLimit}
                  onChange={(event) => toggleGenre(genre.value, event.target.checked)}
                />
                {genre.label}
              </label>
            )
          })}
        </div>
        {fieldErrors.genres ? (
          <p className="field__error" role="alert">
            {fieldErrors.genres}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="publication__attribution" data-testid="public-attribution">
        <legend className="field__label">Attribution</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={attribution.based}
            aria-controls={attribution.based ? creatorId : undefined}
            onChange={(event) => attribute({ based: event.target.checked })}
            data-testid="based-on-external-work"
          />
          This universe is based on someone else&rsquo;s work
        </label>
        {attribution.based ? (
          <div className="publication__attributionfields">
            <div className="field">
              <label className="field__label" htmlFor={creatorId}>
                Original creator or source
              </label>
              <input
                id={creatorId}
                className="field__input"
                maxLength={ORIGINAL_CREATOR_MAX}
                value={attribution.creator}
                aria-required="true"
                aria-describedby={
                  fieldErrors.originalcreator ? `${creatorHintId} ${creatorErrorId}` : creatorHintId
                }
                aria-invalid={fieldErrors.originalcreator ? true : undefined}
                onChange={(event) => attribute({ creator: event.target.value })}
                data-testid="original-creator"
              />
              <p className="field__hint" id={creatorHintId}>
                Credited as the original creator. You are shown as this universe&rsquo;s curator on
                LorEvolve, not its creator.
              </p>
              {fieldErrors.originalcreator ? (
                <p className="field__error" id={creatorErrorId} role="alert">
                  {fieldErrors.originalcreator}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label className="field__label" htmlFor={workId}>
                Original work (optional)
              </label>
              <input
                id={workId}
                className="field__input"
                maxLength={ORIGINAL_WORK_MAX}
                value={attribution.work}
                aria-describedby={fieldErrors.originalwork ? workErrorId : undefined}
                aria-invalid={fieldErrors.originalwork ? true : undefined}
                onChange={(event) => attribute({ work: event.target.value })}
                data-testid="original-work"
              />
              {fieldErrors.originalwork ? (
                <p className="field__error" id={workErrorId} role="alert">
                  {fieldErrors.originalwork}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={isSaving}
          data-testid="save-public-details"
        >
          {isSaving ? 'Saving' : 'Save public details'}
        </button>
        {savedMessage && !isDirty ? (
          <p className="settings__saved" role="status" data-testid="public-details-saved">
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  )
}
