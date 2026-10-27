import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { createChapter, updateChapter } from '../stories/api'
import type { Chapter } from '../stories/types'

interface ChapterDraft {
  title: string
  summary: string
  notes: string
}

interface ChapterFormProps {
  universeId: string
  storyId: string
  /** The chapter being changed, or null for a new one - which is always appended. */
  chapter: Chapter | null
  /** "Chapter 3", for a chapter being edited: its position, shown, never stored. */
  number: string | null
  onClose: () => void
  onSaved: (chapter: Chapter) => void
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/** The draft as the save sends it. */
function inputOf(draft: ChapterDraft) {
  return {
    title: draft.title.trim(),
    summary: trimmed(draft.summary),
    notes: trimmed(draft.notes),
  }
}

/**
 * A chapter's title, summary and notes, in the drawer every LorEvolve form uses. Plain text only: a chapter
 * is structure, so it has no prose, no date, no point of view and no canon of its own.
 *
 * There is no number to type. "Chapter 3" is where the chapter sits in the story, so it changes when the
 * chapters are reordered, and the title stays exactly what the author wrote.
 */
export function ChapterForm({
  universeId,
  storyId,
  chapter,
  number,
  onClose,
  onSaved,
}: ChapterFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the chapter as stored, or the blank form - which the draft is measured against.
  const [initial] = useState<ChapterDraft>(() => ({
    title: chapter?.title ?? '',
    summary: chapter?.summary ?? '',
    notes: chapter?.notes ?? '',
  }))
  const [draft, setDraft] = useState<ChapterDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    chapter
      ? `“${chapter.title}” has unsaved changes. Leave without saving them?`
      : 'This new chapter has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  function edit(change: Partial<ChapterDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = inputOf(draft)

    try {
      const saved = chapter
        ? await updateChapter(universeId, storyId, chapter.id, input)
        : await createChapter(universeId, storyId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That chapter could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="chapter-heading"
      {...dialogProps}
      data-testid="chapter-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {chapter ? <p className="drawer__eyebrow">{`Editing ${number ?? 'a chapter'}`}</p> : null}
          <h2 className="drawer__title" id="chapter-heading">
            {chapter ? chapter.title : 'New chapter'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="chapter-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="chapter-title">
              Title
            </label>
            <p className="field__hint">
              The chapter number comes from its place in the story, so leave it out.
            </p>
            <input
              id="chapter-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="Arrival"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="chapter-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="chapter-summary">
              Summary
            </label>
            <p className="field__hint">What this chapter covers, briefly. Optional.</p>
            <textarea
              id="chapter-summary"
              className="field__input field__input--area"
              rows={3}
              value={draft.summary}
              onChange={(event) => edit({ summary: event.target.value })}
              aria-invalid={fieldErrors.summary ? true : undefined}
              data-testid="chapter-summary-input"
            />
            {fieldErrors.summary ? <p className="field__error">{fieldErrors.summary}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="chapter-notes">
              Notes
            </label>
            <p className="field__hint">Your own planning notes. Only shown here.</p>
            <textarea
              id="chapter-notes"
              className="field__input field__input--area"
              rows={4}
              value={draft.notes}
              onChange={(event) => edit({ notes: event.target.value })}
              aria-invalid={fieldErrors.notes ? true : undefined}
              data-testid="chapter-notes-input"
            />
            {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-chapter">
            {isSaving ? 'Saving' : chapter ? 'Save chapter' : 'Add chapter'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-chapter"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
