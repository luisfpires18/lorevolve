import { useId, type KeyboardEvent } from 'react'
import { DndContext, MouseSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { FoldToggle } from './FoldToggle'
import { LoreReference } from './LoreReference'
import { LoreReorderHandle } from './LoreReorderHandle'
import { useFold } from './fold'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { Scene, SceneBeat, SceneLoreReference } from '../stories/types'

/*
 * What a scene refers to, drawn the same way wherever a scene is shown - its card on the Scenes view and its page on the
 * Manuscript view - so the two cannot drift apart. The scene form edits the date, the point of view, the lore and the
 * beats; the one edit made here is the order of the lore, dragged on the card. `testId` names the surface, so each keeps
 * its own test ids.
 */

type Surface = 'scene' | 'manuscript'

/**
 * Where the scene happens in the world and whose eyes it is seen through, or nothing when it has neither. The date opens
 * the story's timeline, where the scene sits in world order (Issue #48).
 */
export function SceneStamp({
  universeId,
  chronology,
  scene,
  testId,
}: {
  universeId: string
  chronology: Chronology
  scene: Scene
  testId: Surface
}) {
  const { t } = useI18n()
  const when = sceneWhen(chronology, scene.chronology)
  if (!when && !scene.pov) return null

  return (
    <div className="scene__stamp">
      {when ? (
        <span className="scene__when" data-testid={`${testId}-when`}>
          {/* The story's timeline: this scene among its other dated scenes and the moments linked to the story. */}
          <Link
            className="scene__whenlink"
            to={`/app/universes/${universeId}/timeline?story=${scene.storyId}`}
            aria-label={t('stories.scene.timelineLink', { when: when.text })}
            data-testid={`${testId}-timeline`}
          >
            {when.text}
          </Link>
          {when.placed ? null : (
            <span className="scene__unplaced">{t('stories.scene.noPeriod')}</span>
          )}
        </span>
      ) : null}
      {scene.pov ? (
        <span className="scene__pov" data-testid={`${testId}-pov`}>
          <span className="scene__label">{t('stories.scene.pov')}</span>
          <LoreReference universeId={universeId} reference={scene.pov} portrait />
        </span>
      ) : null}
    </div>
  )
}

/**
 * The lore the scene links, each a way to the entry's own page - or named and unlinked while it is in the Trash. All of
 * it, always, in the order the author put it in. Where `onReorder` is given - the scene's card, for an author who may
 * edit - each chip carries a grip: a mouse drags it, the arrow keys move it one place, and either way the whole order
 * goes back to the scene.
 */
export function SceneLore({
  universeId,
  scene,
  testId,
  onReorder,
}: {
  universeId: string
  scene: Scene
  testId: Surface
  /** The scene's lore in its new order, to save. Left out, the list is read-only. */
  onReorder?: (entityIds: string[]) => void
}) {
  const { t } = useI18n()
  const labelId = useId()
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }))
  const entities = scene.entities
  if (entities.length === 0) return null

  const move = (from: number, to: number) => {
    if (!onReorder || to < 0 || to >= entities.length || from === to) return
    const order = entities.map((reference) => reference.entityId)
    const [carried] = order.splice(from, 1)
    order.splice(to, 0, carried!)
    onReorder(order)
  }

  const list = (
    <ul className="scene__lore" aria-labelledby={labelId} data-testid={`${testId}-lore`}>
      {entities.map((reference, index) => (
        <LoreChip
          key={reference.entityId}
          universeId={universeId}
          reference={reference}
          draggable={Boolean(onReorder)}
          onKey={(event) => {
            const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            const on = event.key === 'ArrowRight' || event.key === 'ArrowDown'
            if (!back && !on) return
            event.preventDefault()
            move(index, index + (back ? -1 : 1))
          }}
        />
      ))}
    </ul>
  )

  return (
    <div className="scene__refs scene__refs--lore">
      <span className="scene__label" id={labelId}>
        {t('stories.scene.lore')} <span className="scene__count">{entities.length}</span>
      </span>
      {onReorder ? (
        <DndContext
          sensors={sensors}
          onDragEnd={({ active, over }) => {
            if (!over) return
            const from = entities.findIndex((one) => one.entityId === active.id)
            const to = entities.findIndex((one) => one.entityId === over.id)
            if (from !== -1 && to !== -1) move(from, to)
          }}
          accessibility={{
            screenReaderInstructions: {
              draggable: t('stories.scene.dragInstructions'),
            },
          }}
        >
          {list}
        </DndContext>
      ) : (
        list
      )}
    </div>
  )
}

/** One chip in the list: the entry, and the grip it is moved by where the list can be reordered. */
function LoreChip({
  universeId,
  reference,
  draggable,
  onKey,
}: {
  universeId: string
  reference: SceneLoreReference
  draggable: boolean
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: reference.entityId, disabled: !draggable })

  return (
    <li ref={draggable ? setNodeRef : undefined} data-over={isOver ? 'true' : undefined}>
      {draggable ? (
        <LoreReorderHandle id={reference.entityId} name={reference.name} onKey={onKey} />
      ) : null}
      <LoreReference universeId={universeId} reference={reference} />
    </li>
  )
}

/**
 * The scene's beats, in order (ADR 0070): each step a line, its note under it. Nothing when it has none - a scene needs no
 * beat. Folded like the rest of a story, so a scene of twenty beats stays one line until it is asked for. Edited in the
 * scene's own drawer.
 */
export function SceneBeatList({ beats, testId }: { beats: SceneBeat[]; testId: Surface }) {
  const { t } = useI18n()
  const labelId = useId()
  const {
    open: foldOpen,
    setOpen: setFoldOpen,
    ref: foldRef,
    bodyId: foldBodyId,
  } = useFold<HTMLDivElement>()
  if (beats.length === 0) return null

  return (
    <div className="scene__refs scene__refs--beats" ref={foldRef}>
      <span className="scene__label" id={labelId}>
        <FoldToggle
          open={foldOpen}
          onToggle={setFoldOpen}
          controls={foldBodyId}
          label={t('stories.scene.beatsFoldLabel')}
          testId={`${testId}-beats-toggle`}
        />
        {t('stories.scene.beats')} <span className="scene__count">{beats.length}</span>
      </span>
      <ol
        id={foldBodyId}
        className="scene__beats"
        aria-labelledby={labelId}
        hidden={!foldOpen}
        data-fold={foldBodyId}
        data-testid={`${testId}-beats`}
      >
        {beats.map((beat) => (
          <li key={beat.id} className="scene__beat" data-testid={`${testId}-beat`}>
            <bdi className="scene__beattitle">{beat.title}</bdi>
            {beat.note ? <span className="scene__beatnote">{beat.note}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
