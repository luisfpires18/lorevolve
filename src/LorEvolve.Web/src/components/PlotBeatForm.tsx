import { useEffect, useRef, useState } from 'react'
import { EntityMultiPicker, type EntityChoice } from './EntityPicker'
import { SceneReferencePicker } from './SceneReferencePicker'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { createPlotBeat, updatePlotBeat } from '../stories/api'
import { arcLabel } from '../stories/format'
import type { Chapter, PlotArc, PlotBeat, Scene, SceneLoreReference } from '../stories/types'

interface PlotBeatDraft {
  title: string
  description: string
  notes: string
  arcId: string
  sceneIds: string[]
  entities: EntityChoice[]
}

interface PlotBeatFormProps {
  universeId: string
  storyId: string
  /** The beat being changed, or null for a new one - which is always appended to its arc. */
  beat: PlotBeat | null
  /** The story's arcs, in order. */
  arcs: PlotArc[]
  /** The arc a new beat goes into, or the one an edited beat is in. */
  arcId: string
  chapters: Chapter[]
  scenes: Scene[]
  onClose: () => void
  onSaved: (beat: PlotBeat) => void
}

/**
 * A reference as the picker holds it. An entry in the Trash keeps its place - the form posts every link back, so
 * dropping it would delete it on the next save - and says why it is unavailable.
 */
function choiceOf(reference: SceneLoreReference): EntityChoice {
  return {
    id: reference.entityId,
    name: reference.isTrashed ? `${reference.name} (in Trash)` : reference.name,
  }
}

function trimmed(value: string) {
  const text = value.trim()
  return text === '' ? null : text
}

/**
 * A beat's title, arc, description, notes, scenes and lore, in the drawer every LorEvolve form uses.
 *
 * Nothing here decides where in its arc the beat sits: a new beat goes last, a beat moved to another arc goes last
 * there, and only the plot's own Move up and Move down move it further. Its scenes are chosen from this story and its
 * lore from this universe; both are references, so linking changes neither. The lore picker searches live lore only,
 * so nothing in the Trash can be newly chosen.
 */
export function PlotBeatForm({
  universeId,
  storyId,
  beat,
  arcs,
  arcId,
  chapters,
  scenes,
  onClose,
  onSaved,
}: PlotBeatFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the beat as stored, or the blank form in its arc - which the draft is measured against.
  // Its arc, scenes and lore all count; the order they were picked in does not.
  const [initial] = useState<PlotBeatDraft>(() => {
    const present = new Set(scenes.map((scene) => scene.id))
    return {
      title: beat?.title ?? '',
      description: beat?.description ?? '',
      notes: beat?.notes ?? '',
      arcId,
      // A scene deleted since the plot was read is no longer the story's, so it is not sent back.
      sceneIds: (beat?.sceneIds ?? []).filter((id) => present.has(id)),
      entities: (beat?.entities ?? []).map(choiceOf),
    }
  })
  const [draft, setDraft] = useState<PlotBeatDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = payloadKey(comparableOf(draft)) !== payloadKey(comparableOf(initial))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    beat
      ? `“${beat.title}” has unsaved changes. Leave without saving them?`
      : 'This new beat has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  /** The draft as the save sends it. A new beat's arc is in its address rather than its body. */
  function inputOf(from: PlotBeatDraft) {
    return {
      title: from.title.trim(),
      description: trimmed(from.description),
      notes: trimmed(from.notes),
      sceneIds: from.sceneIds,
      entityIds: from.entities.map((choice) => choice.id),
      plotArcId: beat ? from.arcId : null,
    }
  }

  /** What would be saved, arc included either way. */
  function comparableOf(from: PlotBeatDraft) {
    return { ...inputOf(from), arcId: from.arcId }
  }

  function edit(change: Partial<PlotBeatDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    const input = inputOf(draft)

    try {
      const saved = beat
        ? await updatePlotBeat(universeId, storyId, beat.id, input)
        : await createPlotBeat(universeId, storyId, draft.arcId, input)
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
        setMessage('That beat could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="plot-beat-heading"
      {...dialogProps}
      data-testid="plot-beat-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {beat ? <p className="drawer__eyebrow">Editing a beat</p> : null}
          <h2 className="drawer__title" id="plot-beat-heading">
            {beat ? beat.title : 'New beat'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="plot-beat-error">
              {message}
            </p>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="plot-beat-title">
              Title
            </label>
            <p className="field__hint">One step in the arc. Its number comes from its place.</p>
            <input
              id="plot-beat-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="The capital is breached"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="plot-beat-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          {arcs.length > 1 ? (
            <div className="field">
              <label className="field__label" htmlFor="plot-beat-arc">
                Arc
              </label>
              <p className="field__hint">
                {beat
                  ? 'Choosing another arc moves the beat there, last.'
                  : 'The beat goes last in it.'}
              </p>
              <select
                id="plot-beat-arc"
                className="field__input field__input--select"
                value={draft.arcId}
                onChange={(event) => edit({ arcId: event.target.value })}
                aria-invalid={fieldErrors.plotarcid ? true : undefined}
                data-testid="plot-beat-arc-select"
              >
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
            <label className="field__label" htmlFor="plot-beat-description">
              Description
            </label>
            <p className="field__hint">
              What develops, briefly. Planning, not a fact about the world.
            </p>
            <textarea
              id="plot-beat-description"
              className="field__input field__input--area"
              rows={3}
              value={draft.description}
              onChange={(event) => edit({ description: event.target.value })}
              aria-invalid={fieldErrors.description ? true : undefined}
              data-testid="plot-beat-description-input"
            />
            {fieldErrors.description ? (
              <p className="field__error">{fieldErrors.description}</p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="plot-beat-notes">
              Notes
            </label>
            <p className="field__hint">Your own planning notes. Only shown here.</p>
            <textarea
              id="plot-beat-notes"
              className="field__input field__input--area"
              rows={4}
              value={draft.notes}
              onChange={(event) => edit({ notes: event.target.value })}
              aria-invalid={fieldErrors.notes ? true : undefined}
              data-testid="plot-beat-notes-input"
            />
            {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
          </div>

          <SceneReferencePicker
            chapters={chapters}
            scenes={scenes}
            value={draft.sceneIds}
            onChange={(sceneIds) => edit({ sceneIds })}
            error={fieldErrors.sceneids}
          />

          <div data-testid="plot-beat-lore-field">
            <EntityMultiPicker
              label="Linked lore"
              hint="Lore relevant to this beat. Linking changes nothing about it."
              universeId={universeId}
              value={draft.entities}
              onChange={(entities) => edit({ entities })}
              error={fieldErrors.entityids}
            />
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={isSaving} data-testid="save-plot-beat">
            {isSaving ? 'Saving' : beat ? 'Save beat' : 'Add beat'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-plot-beat"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
