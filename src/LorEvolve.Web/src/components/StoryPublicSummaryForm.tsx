import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { useReturnFocus } from '../lib/returnFocus'
import { saveStoryPublicSummary } from '../publishing/api'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { PUBLIC_SUMMARY_MAX, type ContentPublicationState } from '../publishing/types'

/**
 * A story's public summary (Task 011): the few lines readers of the public portal are shown about it, in the same
 * drawer every LorEvolve form uses and with the same leave guard. Separate from the premise on purpose - the premise is the
 * author's planning text and is never shown or copied here. A failed save keeps the draft, guarded.
 */
export function StoryPublicSummaryForm({
  universeId,
  storyId,
  title,
  summary,
  onClose,
  onSaved,
}: {
  universeId: string
  storyId: string
  title: string
  summary: string | null
  onClose: () => void
  onSaved: (state: ContentPublicationState) => void
}) {
  const { t } = useI18n()
  const field = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(summary ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = draft.trim() !== (summary ?? '').trim()

  useReturnFocus()

  useEffect(() => {
    field.current?.focus()
  }, [])

  async function save() {
    setError(null)
    setIsSaving(true)
    try {
      onSaved(await saveStoryPublicSummary(universeId, storyId, draft.trim() || null))
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.publicSummary ?? failure.message)
          : t('stories.summaryForm.failedSave'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      testId="story-public-summary-form"
      titleId="story-public-summary-heading"
      eyebrow={t('stories.summaryForm.eyebrow')}
      title={<bdi>{title}</bdi>}
      isDirty={isDirty}
      leaveMessage={t('stories.summaryForm.leaveUnsaved')}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="save-story-public-summary"
          >
            {isSaving ? t('stories.summaryForm.saving') : t('stories.summaryForm.save')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-story-public-summary"
          >
            {t('stories.summaryForm.cancel')}
          </button>
        </>
      )}
    >
      {error ? (
        <p className="form__message" role="alert" data-testid="story-public-summary-error">
          {error}
        </p>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="story-public-summary">
          {t('stories.summaryForm.label')}
        </label>
        <p className="field__hint" id="story-public-summary-hint">
          {t('stories.summaryForm.hint')}
        </p>
        <textarea
          id="story-public-summary"
          className="field__input field__input--area"
          ref={field}
          rows={5}
          dir="auto"
          maxLength={PUBLIC_SUMMARY_MAX}
          aria-describedby="story-public-summary-hint story-public-summary-count"
          aria-invalid={error ? true : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          data-testid="story-public-summary-input"
        />
        <p className="field__hint" id="story-public-summary-count">
          {t('stories.summaryForm.count', {
            count: draft.trim().length,
            max: PUBLIC_SUMMARY_MAX,
          })}
        </p>
      </div>
    </Drawer>
  )
}
