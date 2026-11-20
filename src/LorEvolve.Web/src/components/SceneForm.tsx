import { useEffect, useRef, useState } from 'react'
import { ChangeList, EditConflict } from './EditConflict'
import type { ChronologyPointPart } from './ChronologyPointFields'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { Drawer } from './Drawer'
import { useI18n } from '../i18n'
import { getScene } from '../stories/api'
import { beatKey } from '../stories/beats'
import { draftFrom, inputOf, sceneChangesIn, type SceneDraft } from '../stories/sceneDraft'
import type { Chapter, PlotArc, Scene } from '../stories/types'
import { useSceneSave } from '../stories/useSceneSave'
import { SceneFormFields } from './stories/SceneFormFields'
import { FormActions } from './FormActions'

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
  useReturnFocus()

  useEffect(() => {
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

  const { save, fieldErrors, message, isSaving } = useSceneSave({
    universeId,
    storyId,
    scene,
    suggesting,
    onSuggested,
    onSaved,
    base,
    draft,
    reckonsInEras,
    custom,
    setConflict,
    t,
  })

  return (
    <Drawer
      testId="scene-form"
      titleId="scene-heading"
      eyebrow={
        scene
          ? suggesting
            ? t('stories.sceneForm.eyebrowSuggesting')
            : t('stories.sceneForm.eyebrowEditing')
          : null
      }
      title={scene ? scene.title : t('stories.sceneForm.newTitle')}
      dialogRef={dialog}
      isDirty={isDirty}
      leaveMessage={
        suggesting && scene
          ? t('stories.sceneForm.leaveSuggestion', { title: scene.title })
          : scene
            ? t('stories.sceneForm.leaveUnsaved', { title: scene.title })
            : t('stories.sceneForm.leaveNew')
      }
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={
            suggesting
              ? t('stories.sceneForm.sendSuggestion')
              : scene
                ? t('stories.sceneForm.save')
                : t('stories.sceneForm.add')
          }
          busy={isSaving}
          busyLabel={
            suggesting
              ? t('stories.sceneForm.sending')
              : scene
                ? t('stories.sceneForm.saving')
                : t('stories.sceneForm.adding')
          }
          disabled={suggesting && !isDirty}
          submitTestId="save-scene"
          submitRef={saveButton}
          onCancel={close}
          cancelTestId="cancel-scene"
        />
      )}
    >
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

      <SceneFormFields
        universeId={universeId}
        scene={scene}
        chapters={chapters}
        arcs={arcs}
        chronology={chronology}
        suggesting={suggesting}
        title={title}
        draft={draft}
        fieldErrors={fieldErrors}
        hasPoint={hasPoint}
        unreckoned={unreckoned}
        edit={edit}
        setPart={setPart}
      />
    </Drawer>
  )
}
