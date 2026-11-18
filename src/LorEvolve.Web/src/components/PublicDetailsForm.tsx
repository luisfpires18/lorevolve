import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import {
  CATEGORIES,
  categoryLabel,
  GENRES,
  genreLabel,
  MAX_GENRES,
  PUBLIC_SUMMARY_MAX,
  type GenreValue,
  type PublicationState,
} from '../publishing/types'
import { attributionOf, detailsOf, type Attribution } from '../publishing/publicDetailsDraft'
import { publicDetailsActions } from '../publishing/publicDetailsActions'
import { PublicAttributionField } from './publishing/PublicAttributionField'

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
  const { t } = useI18n()
  const summaryId = useId()
  const summaryHintId = useId()
  const categoryId = useId()
  const genresHintId = useId()
  const creatorId = useId()
  const creatorHintId = useId()
  const workId = useId()

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

  useLeaveGuard(isDirty ? t('universe.publicDetails.leave') : null)

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const { toggleGenre, attribute, submit } = publicDetailsActions({
    universeId,
    t,
    creatorId,
    details,
    setSummary,
    setGenres,
    setAttribution,
    setSaved,
    setIsSaving,
    setSavedMessage,
    setFieldErrors,
    setMessage,
    onSaved,
  })

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

      <Field
        label={t('universe.publicDetails.summary')}
        id={summaryId}
        error={
          fieldErrors.publicsummary ? (
            <span role="alert">{fieldErrors.publicsummary}</span>
          ) : undefined
        }
      >
        {(control) => (
          <>
            <textarea
              id={control.id}
              className="field__input field__input--area"
              rows={3}
              maxLength={PUBLIC_SUMMARY_MAX}
              value={summary}
              aria-describedby={`${summaryHintId} ${control['aria-describedby'] ?? ''}`.trim()}
              aria-invalid={control['aria-invalid']}
              onChange={(event) => {
                setSavedMessage(false)
                setSummary(event.target.value)
              }}
              data-testid="public-summary"
            />
            <p className="field__hint" id={summaryHintId}>
              {t('universe.publicDetails.summaryHint', {
                max: PUBLIC_SUMMARY_MAX,
                length: summary.trim().length,
              })}
            </p>
          </>
        )}
      </Field>

      <Field
        label={t('universe.publicDetails.category')}
        id={categoryId}
        error={fieldErrors.category ? <span role="alert">{fieldErrors.category}</span> : undefined}
      >
        {(control) => (
          <select
            id={control.id}
            className="field__input field__input--select"
            value={category}
            aria-describedby={control['aria-describedby']}
            aria-invalid={control['aria-invalid']}
            onChange={(event) => {
              setSavedMessage(false)
              setCategory(event.target.value)
            }}
            data-testid="public-category"
          >
            <option value="">{t('universe.publicDetails.categoryChoose')}</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {categoryLabel(option.value)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label={t('universe.publicDetails.genres')}
        group="fieldset"
        id={genresHintId}
        className="publication__genres"
        hint={t('universe.publicDetails.genresHint', { max: MAX_GENRES, count: genres.length })}
        error={fieldErrors.genres ? <span role="alert">{fieldErrors.genres}</span> : undefined}
      >
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
                {genreLabel(genre.value)}
              </label>
            )
          })}
        </div>
      </Field>

      <PublicAttributionField
        attribution={attribution}
        attribute={attribute}
        fieldErrors={fieldErrors}
        creatorId={creatorId}
        creatorHintId={creatorHintId}
        workId={workId}
      />

      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={isSaving}
          data-testid="save-public-details"
        >
          {isSaving ? t('universe.publicDetails.saving') : t('universe.publicDetails.save')}
        </button>
        {savedMessage && !isDirty ? (
          <p className="settings__saved" role="status" data-testid="public-details-saved">
            {t('universe.publicDetails.saved')}
          </p>
        ) : null}
      </div>
    </form>
  )
}
