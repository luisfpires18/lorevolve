import { useEffect, useRef, useState } from 'react'
import { ChangeList, EditConflict } from './EditConflict'
import { ChronologyPointFields, type ChronologyPointPart } from './ChronologyPointFields'
import { EntityMultiPicker, EntityPicker } from './EntityPicker'
import { hasCalendar, namesEras } from '../chronology/format'
import { isChangedElsewhere } from '../lib/editConflict'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { createScene, getScene, SCENE_CHANGED, updateScene } from '../stories/api'
import { suggestSceneChanges } from '../suggestions/api'
import { chapterLabel, UNCHAPTERED } from '../stories/format'
import {
  draftFrom,
  EMPTY_POINT,
  inputOf,
  sceneChangesIn,
  type SceneDraft,
} from '../stories/sceneDraft'
import type { Chapter, Scene } from '../stories/types'

interface SceneFormProps {
  universeId: string
  storyId: string
  /** The scene being changed, or null for a new one - which is always appended to its chapter. */
  scene: Scene | null
  /** The story's chapters, in order. None means the form asks nothing about chapters. */
  chapters: Chapter[]
  /** Where a new scene starts out: the chapter it was added from, or null for Unchaptered. */
  chapterId: string | null
  chronology: Chronology
  onClose: () => void
  onSaved: (scene: Scene) => void
  /** Sends the form as a suggestion instead of saving it (task 045); the scene itself is not changed. */
  onSuggested?: () => void
}

/**
 * A scene's title, chapter, summary, notes, point of view, place in the world and linked lore, in the
 * drawer every LorEvolve form uses.
 *
 * Nothing here decides where inside its chapter the scene is told: a new scene goes last, a scene moved
 * to another chapter goes last there, and only the story page moves it further. The chronology is where
 * it happens in the world, and the form says so, because a nonlinear story is a valid one. The pickers
 * search live lore only, so nothing in the Trash can be newly chosen.
 */
export function SceneForm({
  universeId,
  storyId,
  scene,
  chapters,
  chapterId,
  chronology,
  onClose,
  onSaved,
  onSuggested,
}: SceneFormProps) {
  const suggesting = onSuggested !== undefined && scene !== null
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the scene as stored, or the blank form in its chapter - which the draft is measured
  // against, and the version its save names. Its chapter, point of view, date and lore all count; the order the lore was
  // picked in does not. After a refused save the author may adopt the latest they reviewed instead (ADR 0043).
  const [base, setBase] = useState(() => ({
    draft: draftFrom(scene, chapterId),
    version: scene?.version,
  }))
  const initial = base.draft
  const [draft, setDraft] = useState<SceneDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const saveButton = useRef<HTMLButtonElement>(null)

  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)
  const hasPoint = Object.values(draft.point).some((part) => part.trim() !== '')

  // A plain year written before the universe had date periods has no period to show in the picker.
  const unreckoned = reckonsInEras && scene?.chronology != null && scene.chronology.eraId === null

  const isDirty =
    payloadKey(inputOf(draft, reckonsInEras, custom)) !==
    payloadKey(inputOf(initial, reckonsInEras, custom))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    suggesting && scene
      ? `Your suggestion for “${scene.title}” hasn’t been sent. Leave without sending it?`
      : scene
        ? `“${scene.title}” has unsaved changes. Leave without saving them?`
        : 'This new scene has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  /** The latest saved scene against the form, in the form's own words. */
  const sceneChanges = sceneChangesIn(chapters, chronology)

  function edit(change: Partial<SceneDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function setPart(part: ChronologyPointPart, value: string) {
    setDraft((current) => ({ ...current, point: { ...current.point, [part]: value } }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const input = inputOf(draft, reckonsInEras, custom)

    try {
      if (suggesting && scene && onSuggested) {
        await suggestSceneChanges(universeId, storyId, scene.id, {
          ...input,
          expectedVersion: base.version,
        })
        onSuggested()
        return
      }
      const saved = scene
        ? await updateScene(universeId, storyId, scene.id, {
            ...input,
            expectedVersion: base.version,
          })
        : await createScene(universeId, storyId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SCENE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : suggesting
              ? 'Some details need a change before this can be sent.'
              : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage(
          suggesting ? 'That suggestion couldn’t be sent.' : 'That scene could not be saved.',
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="scene-heading"
      {...dialogProps}
      data-testid="scene-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {scene ? (
            <p className="drawer__eyebrow">
              {suggesting ? 'Suggesting changes to a scene' : 'Editing a scene'}
            </p>
          ) : null}
          <h2 className="drawer__title" id="scene-heading">
            {scene ? scene.title : 'New scene'}
          </h2>
        </header>

        <div className="drawer__body">
          {suggesting ? (
            <p className="callout" data-testid="scene-suggesting">
              You&rsquo;re suggesting changes. The scene stays as it is until the owner or an Editor
              accepts them.
            </p>
          ) : null}

          {message ? (
            <p className="form__message" role="alert" data-testid="scene-error">
              {message}
            </p>
          ) : null}

          {conflict && scene ? (
            <EditConflict
              what="scene"
              read={() => getScene(universeId, storyId, scene.id)}
              renderLatest={(latest) => (
                <ChangeList changes={sceneChanges(draftFrom(latest, null), draft)} />
              )}
              onKeepMine={(latest) => {
                // The form stays as typed, measured against the latest; the next save names the version reviewed.
                setBase({ draft: draftFrom(latest, null), version: latest.version })
                setConflict(false)
                requestAnimationFrame(() => saveButton.current?.focus())
              }}
              onUseLatest={(latest) => {
                setBase({ draft: draftFrom(latest, null), version: latest.version })
                setDraft(draftFrom(latest, null))
                setConflict(false)
                requestAnimationFrame(() => title.current?.focus())
              }}
              testId="scene-conflict"
              suggesting={suggesting}
            />
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="scene-title">
              Title
            </label>
            <input
              id="scene-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="The Council"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="scene-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          {chapters.length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor="scene-chapter">
                Chapter
              </label>
              <p className="field__hint">
                {scene
                  ? 'Choosing another chapter moves the scene there, last.'
                  : 'The scene goes last in it.'}
              </p>
              <select
                id="scene-chapter"
                className="field__input field__input--select"
                value={draft.chapterId}
                onChange={(event) => edit({ chapterId: event.target.value })}
                aria-invalid={fieldErrors.chapterid ? true : undefined}
                data-testid="scene-chapter-select"
              >
                <option value="">{UNCHAPTERED}</option>
                {chapters.map((chapter, index) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapterLabel(index, chapter.title)}
                  </option>
                ))}
              </select>
              {fieldErrors.chapterid ? (
                <p className="field__error">{fieldErrors.chapterid}</p>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="scene-summary">
              Summary
            </label>
            <p className="field__hint">What happens, briefly.</p>
            <textarea
              id="scene-summary"
              className="field__input field__input--area"
              rows={3}
              value={draft.summary}
              onChange={(event) => edit({ summary: event.target.value })}
              aria-invalid={fieldErrors.summary ? true : undefined}
              data-testid="scene-summary-input"
            />
            {fieldErrors.summary ? <p className="field__error">{fieldErrors.summary}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="scene-notes">
              Notes
            </label>
            <p className="field__hint">Your own planning notes. Only shown here.</p>
            <textarea
              id="scene-notes"
              className="field__input field__input--area"
              rows={4}
              value={draft.notes}
              onChange={(event) => edit({ notes: event.target.value })}
              aria-invalid={fieldErrors.notes ? true : undefined}
              data-testid="scene-notes-input"
            />
            {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
          </div>

          <div data-testid="scene-pov-field">
            <EntityPicker
              label="Point of view"
              universeId={universeId}
              value={draft.pov}
              onChange={(pov) => edit({ pov })}
              placeholder="Anyone or anything in this universe"
              error={fieldErrors.poventityid}
            />
          </div>

          <fieldset className="scenechron">
            <legend className="field__label">When in the world</legend>
            <p className="field__hint">
              Optional. Where this scene happens, not where it is told. It never moves the scene.
            </p>

            <ChronologyPointFields
              chronology={chronology}
              ids={{
                eraId: 'scene-eraId',
                year: 'scene-year',
                month: 'scene-month',
                day: 'scene-day',
              }}
              value={draft.point}
              onChange={setPart}
              errors={{
                eraId: fieldErrors['chronology.eraid'],
                year: fieldErrors['chronology.year'],
                month: fieldErrors['chronology.month'],
                day: fieldErrors['chronology.day'],
              }}
            />

            {unreckoned ? (
              <p className="field__hint" data-testid="scene-unreckoned">
                Placed as a plain year before this universe had date periods. Choose its period, or
                clear it.
              </p>
            ) : null}

            {hasPoint ? (
              <button
                className="button button--secondary button--sm scenechron__clear"
                type="button"
                onClick={() => edit({ point: EMPTY_POINT })}
                data-testid="scene-chronology-clear"
              >
                Clear when
              </button>
            ) : null}
          </fieldset>

          <div data-testid="scene-lore-field">
            <EntityMultiPicker
              label="Linked lore"
              hint="Lore relevant to this scene. Linking says nothing about who is there."
              universeId={universeId}
              value={draft.entities}
              onChange={(entities) => edit({ entities })}
              error={fieldErrors.entityids}
            />
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            ref={saveButton}
            className="button"
            type="submit"
            disabled={isSaving || (suggesting && !isDirty)}
            data-testid="save-scene"
          >
            {suggesting
              ? isSaving
                ? 'Sending'
                : 'Send suggestion'
              : isSaving
                ? 'Saving'
                : scene
                  ? 'Save scene'
                  : 'Add scene'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-scene"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
