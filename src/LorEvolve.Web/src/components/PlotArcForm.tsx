import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { createPlotArc, updatePlotArc } from '../stories/api'
import type { PlotArc } from '../stories/types'

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
          <button className="button" type="submit" disabled={isSaving} data-testid="save-plot-arc">
            {isSaving
              ? t('stories.arcForm.saving')
              : arc
                ? t('stories.arcForm.save')
                : t('stories.arcForm.add')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-plot-arc"
          >
            {t('stories.arcForm.cancel')}
          </button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="plot-arc-error">
          {message}
        </p>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="plot-arc-title">
          {t('stories.arcForm.titleLabel')}
        </label>
        <p className="field__hint">{t('stories.arcForm.titleHint')}</p>
        <input
          id="plot-arc-title"
          className="field__input"
          ref={title}
          type="text"
          dir="auto"
          placeholder={t('stories.arcForm.titlePlaceholder')}
          value={draft.title}
          onChange={(event) => edit({ title: event.target.value })}
          aria-invalid={fieldErrors.title ? true : undefined}
          data-testid="plot-arc-title-input"
        />
        {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="plot-arc-description">
          {t('stories.arcForm.descriptionLabel')}
        </label>
        <p className="field__hint">{t('stories.arcForm.descriptionHint')}</p>
        <textarea
          id="plot-arc-description"
          className="field__input field__input--area"
          rows={3}
          value={draft.description}
          onChange={(event) => edit({ description: event.target.value })}
          aria-invalid={fieldErrors.description ? true : undefined}
          data-testid="plot-arc-description-input"
        />
        {fieldErrors.description ? <p className="field__error">{fieldErrors.description}</p> : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="plot-arc-notes">
          {t('stories.arcForm.notesLabel')}
        </label>
        <p className="field__hint">{t('stories.arcForm.notesHint')}</p>
        <textarea
          id="plot-arc-notes"
          className="field__input field__input--area"
          rows={4}
          value={draft.notes}
          onChange={(event) => edit({ notes: event.target.value })}
          aria-invalid={fieldErrors.notes ? true : undefined}
          data-testid="plot-arc-notes-input"
        />
        {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
      </div>
    </Drawer>
  )
}
