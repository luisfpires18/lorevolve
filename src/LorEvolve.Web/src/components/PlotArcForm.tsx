import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { createPlotArc, updatePlotArc } from '../stories/api'
import type { PlotArc } from '../stories/types'
import { Button } from './Button'

interface PlotArcDraft {
  title: string
  description: string
  notes: string
}

interface PlotArcFormProps {
  universeId: string
  storyId: string
  /** The arc being changed, or null for a new one - which is always appended. */
  arc: PlotArc | null
  /** "Arc 2", for an arc being edited: its position, shown, never stored. */
  number: string | null
  onClose: () => void
  onSaved: (arc: PlotArc) => void
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/** The draft as the save sends it. */
function inputOf(draft: PlotArcDraft) {
  return {
    title: draft.title.trim(),
    description: trimmed(draft.description),
    notes: trimmed(draft.notes),
  }
}

/**
 * An arc's title, description and notes, in the drawer every LorEvolve form uses. Plain text only: an arc is a thread
 * the author means to follow, so it has no date, no chapter, no status and no canon of its own, and LorEvolve reads
 * nothing into what it is called.
 *
 * There is no number to type. "Arc 2" is where the arc sits in the plot, so it changes when the arcs are reordered.
 */
export function PlotArcForm({
  universeId,
  storyId,
  arc,
  number,
  onClose,
  onSaved,
}: PlotArcFormProps) {
  const { t } = useI18n()
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the arc as stored, or the blank form - which the draft is measured against.
  const [initial] = useState<PlotArcDraft>(() => ({
    title: arc?.title ?? '',
    description: arc?.description ?? '',
    notes: arc?.notes ?? '',
  }))
  const [draft, setDraft] = useState<PlotArcDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))

  useReturnFocus()

  useEffect(() => {
    title.current?.focus()
  }, [])

  function edit(change: Partial<PlotArcDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = inputOf(draft)

    try {
      const saved = arc
        ? await updatePlotArc(universeId, storyId, arc.id, input)
        : await createPlotArc(universeId, storyId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('stories.arcForm.detailsToSave'),
        )
      } else {
        setMessage(t('stories.arcForm.failedSave'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      testId="plot-arc-form"
      titleId="plot-arc-heading"
      eyebrow={
        arc ? t('stories.arcForm.eyebrow', { what: number ?? t('stories.arcForm.anArc') }) : null
      }
      title={arc ? arc.title : t('stories.arcForm.newTitle')}
      isDirty={isDirty}
      leaveMessage={
        arc
          ? t('stories.arcForm.leaveUnsaved', { title: arc.title })
          : t('stories.arcForm.leaveNew')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <Button type="submit" disabled={isSaving} data-testid="save-plot-arc">
            {isSaving
              ? arc
                ? t('stories.arcForm.saving')
                : t('stories.arcForm.adding')
              : arc
                ? t('stories.arcForm.save')
                : t('stories.arcForm.add')}
          </Button>
          <Button tone="secondary" onClick={close} data-testid="cancel-plot-arc">
            {t('stories.arcForm.cancel')}
          </Button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="plot-arc-error">
          {message}
        </p>
      ) : null}

      <Field
        id="plot-arc-title"
        label={t('stories.arcForm.titleLabel')}
        hint={t('stories.arcForm.titleHint')}
        error={fieldErrors.title}
      >
        {(control) => (
          <input
            {...control}
            className="field__input"
            ref={title}
            type="text"
            dir="auto"
            placeholder={t('stories.arcForm.titlePlaceholder')}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            data-testid="plot-arc-title-input"
          />
        )}
      </Field>

      <Field
        id="plot-arc-description"
        label={t('stories.arcForm.descriptionLabel')}
        hint={t('stories.arcForm.descriptionHint')}
        error={fieldErrors.description}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={3}
            value={draft.description}
            onChange={(event) => edit({ description: event.target.value })}
            data-testid="plot-arc-description-input"
          />
        )}
      </Field>

      <Field
        id="plot-arc-notes"
        label={t('stories.arcForm.notesLabel')}
        hint={t('stories.arcForm.notesHint')}
        error={fieldErrors.notes}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={4}
            value={draft.notes}
            onChange={(event) => edit({ notes: event.target.value })}
            data-testid="plot-arc-notes-input"
          />
        )}
      </Field>
    </Drawer>
  )
}
