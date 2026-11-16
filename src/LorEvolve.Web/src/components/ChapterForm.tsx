import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { Drawer } from './Drawer'
import { Field } from './Field'
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
  useReturnFocus()

  useEffect(() => {
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
    <Drawer
      testId="chapter-form"
      titleId="chapter-heading"
      eyebrow={
        chapter
          ? t('stories.chapterForm.eyebrow', { what: number ?? t('stories.chapterForm.aChapter') })
          : null
      }
      title={chapter ? chapter.title : t('stories.chapterForm.newTitle')}
      isDirty={isDirty}
      leaveMessage={
        chapter
          ? t('stories.chapterForm.leaveUnsaved', { title: chapter.title })
          : t('stories.chapterForm.leaveNew')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <button className="button" type="submit" disabled={isSaving} data-testid="save-chapter">
            {isSaving
              ? chapter
                ? t('stories.chapterForm.saving')
                : t('stories.chapterForm.adding')
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
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="chapter-error">
          {message}
        </p>
      ) : null}

      <Field
        id="chapter-title"
        label={t('stories.chapterForm.titleLabel')}
        hint={t('stories.chapterForm.titleHint')}
        error={fieldErrors.title}
      >
        {(control) => (
          <input
            {...control}
            className="field__input"
            ref={title}
            type="text"
            dir="auto"
            placeholder={t('stories.chapterForm.titlePlaceholder')}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            data-testid="chapter-title-input"
          />
        )}
      </Field>

      {arcs.length > 0 ? (
        <Field
          id="chapter-arc"
          label={t('stories.chapterForm.arcLabel')}
          hint={
            chapter ? t('stories.chapterForm.arcHintMove') : t('stories.chapterForm.arcHintNew')
          }
          error={fieldErrors.plotarcid}
        >
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={draft.arcId}
              onChange={(event) => edit({ arcId: event.target.value })}
              data-testid="chapter-arc-select"
            >
              <option value="">{t('stories.chapterForm.noArc')}</option>
              {arcs.map((arc, index) => (
                <option key={arc.id} value={arc.id}>
                  {arcLabel(index, arc.title)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Field
        id="chapter-summary"
        label={t('stories.chapterForm.summaryLabel')}
        hint={t('stories.chapterForm.summaryHint')}
        error={fieldErrors.summary}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={3}
            value={draft.summary}
            onChange={(event) => edit({ summary: event.target.value })}
            data-testid="chapter-summary-input"
          />
        )}
      </Field>

      <Field
        id="chapter-notes"
        label={t('stories.chapterForm.notesLabel')}
        hint={t('stories.chapterForm.notesHint')}
        error={fieldErrors.notes}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={4}
            value={draft.notes}
            onChange={(event) => edit({ notes: event.target.value })}
            data-testid="chapter-notes-input"
          />
        )}
      </Field>
    </Drawer>
  )
}
