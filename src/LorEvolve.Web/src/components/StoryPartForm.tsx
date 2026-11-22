import { useRef } from 'react'
import { useFormSave } from '../lib/useFormSave'
import { useDraftForm } from '../lib/useDraftForm'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { useI18n } from '../i18n'
import {
  createChapter,
  createPlotArc,
  moveChapterToArc,
  updateChapter,
  updatePlotArc,
} from '../stories/api'
import { arcLabel } from '../stories/format'
import type { Chapter, PlotArc } from '../stories/types'

interface StoryPartDraft {
  title: string
  /** A chapter's summary, an arc's description. */
  text: string
  notes: string
  /** The arc a chapter is in, or '' for none (ADR 0070). Always '' for an arc. */
  arcId: string
}

type StoryPartFormProps = {
  universeId: string
  storyId: string
  /** "Chapter 3" or "Arc 2", for a part being edited: its position, shown, never stored. */
  number: string | null
  onClose: () => void
} & (
  | {
      kind: 'chapter'
      /** The chapter being changed, or null for a new one - which is always appended. */
      part: Chapter | null
      /** The arc a new chapter starts in, or null for none (ADR 0070). Never read for a chapter being edited. */
      plotArcId?: string | null
      /** The story's arcs, in order: with any, the form offers the arc the chapter is in. */
      arcs?: PlotArc[]
      onSaved: (chapter: Chapter) => void
    }
  | {
      kind: 'arc'
      /** The arc being changed, or null for a new one - which is always appended. */
      part: PlotArc | null
      onSaved: (arc: PlotArc) => void
    }
)

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/** The draft as the save sends it; `text` goes as a chapter's `summary`, an arc's `description`. */
function inputOf(draft: StoryPartDraft) {
  return {
    title: draft.title.trim(),
    text: trimmed(draft.text),
    notes: trimmed(draft.notes),
  }
}

/**
 * A chapter's or an arc's title, summary or description, and notes, in the drawer every LorEvolve form uses. Plain
 * text only: a chapter is structure and an arc a thread the author means to follow, so neither has prose, a date, a
 * status or a canon of its own. A chapter also offers the arc it is in, when the story has any.
 *
 * There is no number to type. "Chapter 3" and "Arc 2" are where the part sits, so they change when it is reordered,
 * and the title stays exactly what the author wrote.
 */
export function StoryPartForm(props: StoryPartFormProps) {
  const { kind, universeId, storyId, part, number, onClose } = props
  const arcs = props.kind === 'chapter' ? (props.arcs ?? []) : []
  const ns = kind === 'chapter' ? 'stories.chapterForm' : 'stories.arcForm'
  const id = kind === 'chapter' ? 'chapter' : 'plot-arc'
  const textField = kind === 'chapter' ? 'summary' : 'description'
  const { t } = useI18n()
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the part as stored, or the blank form - which the draft is measured against.
  const { draft, edit, isDirty } = useDraftForm<StoryPartDraft>(
    () => ({
      title: part?.title ?? '',
      text: (props.kind === 'chapter' ? props.part?.summary : props.part?.description) ?? '',
      notes: part?.notes ?? '',
      arcId:
        (props.kind === 'chapter'
          ? props.part
            ? props.part.plotArcId
            : (props.plotArcId ?? null)
          : null) ?? '',
    }),
    // The arc is a pick the text measure leaves out, so it counts on its own.
    { measure: (of) => ({ ...inputOf(of), arcId: of.arcId }) },
  )
  const form = useFormSave({
    needChange: t(`${ns}.detailsToSave`),
    failed: t(`${ns}.failedSave`),
  })
  const { fieldErrors, message, isSaving } = form

  async function save() {
    const { text, ...rest } = inputOf(draft)

    await form.save(async () => {
      if (props.kind === 'arc') {
        const input = { ...rest, description: text }
        const { part: arc } = props
        props.onSaved(
          arc
            ? await updatePlotArc(universeId, storyId, arc.id, input)
            : await createPlotArc(universeId, storyId, input),
        )
        return
      }
      const input = { ...rest, summary: text }
      const { part: chapter } = props
      const arcId = draft.arcId === '' ? null : draft.arcId
      let saved = chapter
        ? await updateChapter(universeId, storyId, chapter.id, input)
        : await createChapter(universeId, storyId, { ...input, plotArcId: arcId })
      // Another arc moves the chapter there, last, with its scenes: the route that does it everywhere else.
      if (chapter && arcId !== (chapter.plotArcId ?? null)) {
        saved = await moveChapterToArc(universeId, storyId, chapter.id, arcId)
      }
      props.onSaved(saved)
    })
  }

  return (
    <Drawer
      initialFocus={title}
      testId={`${id}-form`}
      titleId={`${id}-heading`}
      eyebrow={
        part
          ? t(`${ns}.eyebrow`, {
              what:
                number ??
                t(kind === 'chapter' ? 'stories.chapterForm.aChapter' : 'stories.arcForm.anArc'),
            })
          : null
      }
      title={part ? part.title : t(`${ns}.newTitle`)}
      isDirty={isDirty}
      leaveMessage={part ? t(`${ns}.leaveUnsaved`, { title: part.title }) : t(`${ns}.leaveNew`)}
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      message={message}
      messageTestId={`${id}-error`}
      actions={{
        submitLabel: part ? t(`${ns}.save`) : t(`${ns}.add`),
        busyLabel:
          kind === 'chapter'
            ? part
              ? t('stories.chapterForm.saving')
              : t('stories.chapterForm.adding')
            : part
              ? t('stories.arcForm.saving')
              : t('stories.arcForm.adding'),
        submitTestId: `save-${id}`,
        cancelTestId: `cancel-${id}`,
      }}
    >
      <Field
        id={`${id}-title`}
        label={t(`${ns}.titleLabel`)}
        hint={t(`${ns}.titleHint`)}
        error={fieldErrors.title}
        name={null}
        ref={title}
        type="text"
        dir="auto"
        placeholder={t(`${ns}.titlePlaceholder`)}
        value={draft.title}
        onChange={(event) => edit({ title: event.target.value })}
        data-testid={`${id}-title-input`}
      />

      {arcs.length > 0 ? (
        <Field
          as="select"
          id="chapter-arc"
          label={t('stories.chapterForm.arcLabel')}
          hint={part ? t('stories.chapterForm.arcHintMove') : t('stories.chapterForm.arcHintNew')}
          error={fieldErrors.plotarcid}
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
        </Field>
      ) : null}

      <Field
        as="textarea"
        id={`${id}-${textField}`}
        label={t(
          kind === 'chapter'
            ? 'stories.chapterForm.summaryLabel'
            : 'stories.arcForm.descriptionLabel',
        )}
        hint={t(
          kind === 'chapter'
            ? 'stories.chapterForm.summaryHint'
            : 'stories.arcForm.descriptionHint',
        )}
        error={fieldErrors[textField]}
        rows={3}
        value={draft.text}
        onChange={(event) => edit({ text: event.target.value })}
        data-testid={`${id}-${textField}-input`}
      />

      <Field
        as="textarea"
        id={`${id}-notes`}
        label={t(`${ns}.notesLabel`)}
        hint={t(`${ns}.notesHint`)}
        error={fieldErrors.notes}
        rows={4}
        value={draft.notes}
        onChange={(event) => edit({ notes: event.target.value })}
        data-testid={`${id}-notes-input`}
      />
    </Drawer>
  )
}
