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
import { useI18n } from '../i18n'
import { createScene, getScene, SCENE_CHANGED, updateScene } from '../stories/api'
import { suggestSceneChanges } from '../suggestions/api'
import { unchaptered } from '../stories/format'
import { chapterChoices } from '../stories/structure'
import { SceneBeatsField } from './SceneBeatsField'
import { beatKey } from '../stories/beats'
import {
  draftFrom,
  EMPTY_POINT,
  inputOf,
  sceneChangesIn,
  type SceneDraft,
} from '../stories/sceneDraft'
import type { Chapter, PlotArc, Scene } from '../stories/types'

interface SceneFormProps {
  universeId: string
  storyId: string
  /** The scene being changed, or null for a new one - which is always appended to its chapter. */
  scene: Scene | null
  /** The story's chapters, in order. None means the form asks nothing about chapters. */
  chapters: Chapter[]
  /** The story's arcs, so a chapter is named the way the Scenes view numbers it (ADR 0070). */
  arcs?: PlotArc[]
  /** Where a new scene starts out: the chapter it was added from, or null for Unchaptered. */
  chapterId: string | null
  chronology: Chronology
  onClose: () => void
  onSaved: (scene: Scene) => void
  /** Sends the form as a suggestion instead of saving it (task 045); the scene itself is not changed. */
  onSuggested?: () => void
  /** Opens on a new, empty beat row with the focus in it: the scene menu's Add beat. An empty row is no change. */
  startWithBeat?: boolean
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
  arcs = [],
  chapterId,
  chronology,
  onClose,
  onSaved,
  onSuggested,
  startWithBeat = false,
}: SceneFormProps) {
  const { t } = useI18n()
  const suggesting = onSuggested !== undefined && scene !== null
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the scene as stored, or the blank form in its chapter - which the draft is measured
  // against, and the version its save names. Its chapter, point of view, date and lore all count, and so does the order
  // the lore was picked in: it is kept and shown that way. After a refused save the author may adopt the latest they reviewed instead (ADR 0043).
  const [base, setBase] = useState(() => ({
    draft: draftFrom(scene, chapterId),
    version: scene?.version,
  }))
  const initial = base.draft
  const [draft, setDraft] = useState<SceneDraft>(() =>
    startWithBeat && !suggesting
      ? { ...initial, beats: [...initial.beats, { key: beatKey(), title: '', note: '' }] }
      : initial,
  )
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

  const loreOrder = (of: SceneDraft) => of.entities.map((choice) => choice.id).join(' ')
  const isDirty =
    payloadKey(inputOf(draft, reckonsInEras, custom)) !==
      payloadKey(inputOf(initial, reckonsInEras, custom)) || loreOrder(draft) !== loreOrder(initial)
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    suggesting && scene
      ? t('stories.sceneForm.leaveSuggestion', { title: scene.title })
      : scene
        ? t('stories.sceneForm.leaveUnsaved', { title: scene.title })
        : t('stories.sceneForm.leaveNew'),
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    const beat = startWithBeat
      ? [
          ...(dialog.current?.querySelectorAll<HTMLInputElement>(
            '[data-testid="scene-beat-title"]',
          ) ?? []),
        ].at(-1)
      : undefined
    if (beat) {
      beat.focus()
      beat.scrollIntoView({ block: 'center' })
    } else {
      title.current?.focus()
    }
    // Once, as the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The latest saved scene against the form, in the form's own words. */
  const sceneChanges = sceneChangesIn(chapters, chronology, arcs)

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
              ? t('stories.sceneForm.detailsToSend')
              : t('stories.sceneForm.detailsToSave'),
        )
      } else {
        setMessage(
          suggesting ? t('stories.sceneForm.failedSend') : t('stories.sceneForm.failedSave'),
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
              {suggesting
                ? t('stories.sceneForm.eyebrowSuggesting')
                : t('stories.sceneForm.eyebrowEditing')}
            </p>
          ) : null}
          <h2 className="drawer__title" id="scene-heading">
            {scene ? scene.title : t('stories.sceneForm.newTitle')}
          </h2>
        </header>

        <div className="drawer__body">
          {suggesting ? (
            <p className="callout" data-testid="scene-suggesting">
              {t('stories.sceneForm.suggestingNote')}
            </p>
          ) : null}

          {message ? (
            <p className="form__message" role="alert" data-testid="scene-error">
              {message}
            </p>
          ) : null}

          {conflict && scene ? (
            <EditConflict
              what={t('stories.sceneForm.conflictNoun')}
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
              {t('stories.sceneForm.titleLabel')}
            </label>
            <input
              id="scene-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder={t('stories.sceneForm.titlePlaceholder')}
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
                {t('stories.sceneForm.chapterLabel')}
              </label>
              <p className="field__hint">
                {scene
                  ? t('stories.sceneForm.chapterHintMove')
                  : t('stories.sceneForm.chapterHintNew')}
              </p>
              <select
                id="scene-chapter"
                className="field__input field__input--select"
                value={draft.chapterId}
                onChange={(event) => edit({ chapterId: event.target.value })}
                aria-invalid={fieldErrors.chapterid ? true : undefined}
                data-testid="scene-chapter-select"
              >
                <option value="">{unchaptered()}</option>
                {chapterChoices(arcs, chapters).map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
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
              {t('stories.sceneForm.summaryLabel')}
            </label>
            <p className="field__hint">{t('stories.sceneForm.summaryHint')}</p>
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

          {/* A suggestion never changes a scene's beats: the API takes none from one. */}
          {suggesting ? null : (
            <SceneBeatsField
              beats={draft.beats}
              onChange={(beats) => edit({ beats })}
              errors={fieldErrors}
            />
          )}

          <div className="field">
            <label className="field__label" htmlFor="scene-notes">
              {t('stories.sceneForm.notesLabel')}
            </label>
            <p className="field__hint">{t('stories.sceneForm.notesHint')}</p>
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
              label={t('stories.sceneForm.povLabel')}
              universeId={universeId}
              value={draft.pov}
              onChange={(pov) => edit({ pov })}
              placeholder={t('stories.sceneForm.povPlaceholder')}
              error={fieldErrors.poventityid}
            />
          </div>

          <fieldset className="scenechron">
            <legend className="field__label">{t('stories.sceneForm.whenLegend')}</legend>
            <p className="field__hint">{t('stories.sceneForm.whenHint')}</p>

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
                {t('stories.sceneForm.unreckoned')}
              </p>
            ) : null}

            {hasPoint ? (
              <button
                className="button button--secondary button--sm scenechron__clear"
                type="button"
                onClick={() => edit({ point: EMPTY_POINT })}
                data-testid="scene-chronology-clear"
              >
                {t('stories.sceneForm.clearWhen')}
              </button>
            ) : null}
          </fieldset>

          <div data-testid="scene-lore-field">
            <EntityMultiPicker
              label={t('stories.sceneForm.loreLabel')}
              hint={t('stories.sceneForm.loreHint')}
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
                ? t('stories.sceneForm.sending')
                : t('stories.sceneForm.sendSuggestion')
              : isSaving
                ? t('stories.sceneForm.saving')
                : scene
                  ? t('stories.sceneForm.save')
                  : t('stories.sceneForm.add')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-scene"
          >
            {t('stories.sceneForm.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
