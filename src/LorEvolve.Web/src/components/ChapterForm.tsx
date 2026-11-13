import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'
import { createChapter, moveChapterToArc, updateChapter } from '../stories/api'
import { arcLabel } from '../stories/format'
import type { Chapter, PlotArc } from '../stories/types'

interface ChapterDraft {
  title: string
  summary: string
  notes: string
  /** The arc it is in, or '' for none (ADR 0070). */
  arcId: string
}

interface ChapterFormProps {
  universeId: string
  storyId: string
  /** The chapter being changed, or null for a new one - which is always appended. */
  chapter: Chapter | null
  /** "Chapter 3", for a chapter being edited: its position, shown, never stored. */
  number: string | null
  /** The arc a new chapter starts in, or null for none (ADR 0070). Never read for a chapter being edited. */
  plotArcId?: string | null
  /** The story's arcs, in order: with any, the form offers the arc the chapter is in. */
  arcs?: PlotArc[]
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
  plotArcId = null,
  arcs = [],
  onClose,
  onSaved,
}: ChapterFormProps) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the chapter as stored, or the blank form - which the draft is measured against.
  const [initial] = useState<ChapterDraft>(() => ({
    title: chapter?.title ?? '',
    summary: chapter?.summary ?? '',
    notes: chapter?.notes ?? '',
    arcId: (chapter ? chapter.plotArcId : plotArcId) ?? '',
  }))
  const [draft, setDraft] = useState<ChapterDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial)) || draft.arcId !== initial.arcId
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    chapter
      ? t('stories.chapterForm.leaveUnsaved', { title: chapter.title })
      : t('stories.chapterForm.leaveNew'),
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
      const arcId = draft.arcId === '' ? null : draft.arcId
      let saved = chapter
        ? await updateChapter(universeId, storyId, chapter.id, input)
        : await createChapter(universeId, storyId, { ...input, plotArcId: arcId })
      // Another arc moves the chapter there, last, with its scenes: the route that does it everywhere else.
      if (chapter && arcId !== (chapter.plotArcId ?? null)) {
        saved = await moveChapterToArc(universeId, storyId, chapter.id, arcId)
      }
      onSaved(saved)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('stories.chapterForm.detailsToSave'),
        )
      } else {
        setMessage(t('stories.chapterForm.failedSave'))
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
          {chapter ? (
            <p className="drawer__eyebrow">
              {t('stories.chapterForm.eyebrow', {
                what: number ?? t('stories.chapterForm.aChapter'),
              })}
            </p>
          ) : null}
          <h2 className="drawer__title" id="chapter-heading">
            {chapter ? chapter.title : t('stories.chapterForm.newTitle')}
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
              {t('stories.chapterForm.titleLabel')}
            </label>
            <p className="field__hint">{t('stories.chapterForm.titleHint')}</p>
            <input
              id="chapter-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder={t('stories.chapterForm.titlePlaceholder')}
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="chapter-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          {arcs.length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor="chapter-arc">
                {t('stories.chapterForm.arcLabel')}
              </label>
              <p className="field__hint">
                {chapter
                  ? t('stories.chapterForm.arcHintMove')
                  : t('stories.chapterForm.arcHintNew')}
              </p>
              <select
                id="chapter-arc"
                className="field__input field__input--select"
                value={draft.arcId}
                onChange={(event) => edit({ arcId: event.target.value })}
                aria-invalid={fieldErrors.plotarcid ? true : undefined}
                data-testid="chapter-arc-select"
              >
                <option value="">{t('stories.chapterForm.noArc')}</option>
                {arcs.map((arc, index) => (
                  <option key={arc.id} value={arc.id}>
                    {arcLabel(index, arc.title)}
                  </option>
                ))}
              </select>
              {fieldErrors.plotarcid ? (
                <p className="field__error">{fieldErrors.plotarcid}</p>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="chapter-summary">
              {t('stories.chapterForm.summaryLabel')}
            </label>
            <p className="field__hint">{t('stories.chapterForm.summaryHint')}</p>
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
              {t('stories.chapterForm.notesLabel')}
            </label>
            <p className="field__hint">{t('stories.chapterForm.notesHint')}</p>
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
            {isSaving
              ? t('stories.chapterForm.saving')
              : chapter
                ? t('stories.chapterForm.save')
                : t('stories.chapterForm.add')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-chapter"
          >
            {t('stories.chapterForm.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
