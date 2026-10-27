import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { saveStoryPublicSummary } from '../publishing/api'
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
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(summary ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = draft.trim() !== (summary ?? '').trim()
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    'The public summary has unsaved changes. Leave without saving them?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
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
          : 'The public summary could not be saved.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="story-public-summary-heading"
      {...dialogProps}
      data-testid="story-public-summary-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">Publishing</p>
          <h2 className="drawer__title" id="story-public-summary-heading">
            <bdi>{title}</bdi>
          </h2>
        </header>

        <div className="drawer__body">
          {error ? (
            <p className="form__message" role="alert" data-testid="story-public-summary-error">
              {error}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="story-public-summary">
              Public summary
            </label>
            <p className="field__hint" id="story-public-summary-hint">
              Shown to readers on the public portal. Your premise stays private.
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
              {draft.trim().length} of {PUBLIC_SUMMARY_MAX} characters
            </p>
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="save-story-public-summary"
          >
            {isSaving ? 'Saving' : 'Save public summary'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-story-public-summary"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
