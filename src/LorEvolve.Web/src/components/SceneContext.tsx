import { useId, type KeyboardEvent } from 'react'
import { DndContext, MouseSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { DisclosureButton } from './DisclosureButton'
import { EntityRow } from './EntityRow'
import { Fact } from './Fact'
import { FactList } from './FactList'
import { TypeReorderHandle } from './TypeReorderHandle'
import { useFold } from './fold'
import type { Chronology } from '../chronology/types'
import { sceneWhen } from '../stories/format'
import type { Scene, SceneBeat, SceneLoreReference } from '../stories/types'
import { HeadingCount } from './HeadingCount'

/*
 * What a scene refers to, drawn the same way wherever a scene is shown - its card on the Scenes view and its page on the
 * Manuscript view - so the two cannot drift apart. Each part is one or two Facts; the caller holds them in a FactList.
 * The scene form edits the date, the point of view, the lore and the beats; the one edit made here is the order of the
 * lore, dragged on the card. `testId` names the surface, so each keeps its own test ids.
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
    <>
      {when ? (
        <Fact name={t('stories.scene.when')} valueTestId={`${testId}-when`}>
          {/* The story's timeline: this scene among its other dated scenes and the moments linked to the story. */}
          <Link
            to={`/app/universes/${universeId}/timeline?story=${scene.storyId}`}
            aria-label={t('stories.scene.timelineLink', { when: when.text })}
            data-testid={`${testId}-timeline`}
          >
            {when.text}
          </Link>
          {when.placed ? null : t('stories.scene.noPeriod')}
        </Fact>
      ) : null}
      {scene.pov ? (
        <Fact name={t('stories.scene.pov')} valueTestId={`${testId}-pov`}>
          <ul className="relations__rows">
            <LoreRow universeId={universeId} reference={scene.pov} />
          </ul>
        </Fact>
      ) : null}
    </>
  )
}

/**
 * The lore the scene links, each a way to the entry's own page - or named and unlinked while it is in the Trash. All of
 * it, always, in the order the author put it in. Where `onReorder` is given - the scene's card, for an author who may
 * edit - each row carries a grip: a mouse drags it, the arrow keys move it one place, and either way the whole order
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
    <ul className="relations__rows" aria-labelledby={labelId} data-testid={`${testId}-lore`}>
      {entities.map((reference, index) => (
        <LoreRow
          key={reference.entityId}
          universeId={universeId}
          reference={reference}
          onKey={
            onReorder
              ? (event) => {
                  const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  const on = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                  if (!back && !on) return
                  event.preventDefault()
                  move(index, index + (back ? -1 : 1))
                }
              : undefined
          }
        />
      ))}
    </ul>
  )

  return (
    <Fact
      name={
        <span id={labelId}>
          {t('stories.scene.lore')} <HeadingCount n={entities.length} look="pill" />
        </span>
      }
    >
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
    </Fact>
  )
}

/**
 * One linked entry, as Lore draws a linked entry: its tile and its name, a real link to the entry's own page; an entry in
 * the Trash is named but not linked, because it has no page to open while it is there. With `onKey` it carries the grip
 * it is moved by.
 */
function LoreRow({
  universeId,
  reference,
  onKey,
}: {
  universeId: string
  reference: SceneLoreReference
  onKey?: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { t } = useI18n()
  const { setNodeRef } = useDroppable({ id: reference.entityId, disabled: !onKey })
  const name = <bdi>{reference.name}</bdi>

  return (
    <li
      ref={onKey ? setNodeRef : undefined}
      className="relation"
      data-testid={reference.isTrashed ? 'lore-reference-trashed' : 'lore-reference'}
    >
      <EntityRow
        universeId={universeId}
        entityId={reference.entityId}
        // A trashed entry's picture is not served, so it is drawn as its type's tile instead.
        image={reference.isTrashed ? null : reference.image}
        typeIcon={reference.entityTypeIcon}
        typeAccent={reference.entityTypeAccentColor}
        name={
          reference.isTrashed ? (
            <span className="relation__name">{name}</span>
          ) : (
            <Link
              className="relation__name"
              to={`/app/universes/${universeId}/lore/${reference.entityId}`}
              title={reference.entityTypeName}
            >
              {name}
            </Link>
          )
        }
        meta={reference.isTrashed ? t('lore.reference.inTrash') : undefined}
      />
      {onKey ? (
        <TypeReorderHandle
          id={reference.entityId}
          name={reference.name}
          label={t('stories.picks.reorder', { name: reference.name })}
          testId={`lore-reorder-${reference.name}`}
          onKey={onKey}
        />
      ) : null}
    </li>
  )
}

/**
 * The scene's beats, in order (ADR 0070): each step a fact, its note beside it. Nothing when it has none - a scene needs
 * no beat. Folded like the rest of a story, so a scene of twenty beats stays one line until it is asked for. Edited in
 * the scene's own drawer.
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

  const label = t('stories.scene.beatsFoldLabel')
  return (
    <Fact
      ref={foldRef}
      name={
        <span id={labelId}>
          <DisclosureButton
            tone="text"
            size="sm"
            expanded={foldOpen}
            controls={foldBodyId}
            aria-label={
              foldOpen
                ? t('stories.page.fold.collapseLabel', { label })
                : t('stories.page.fold.expandLabel', { label })
            }
            title={foldOpen ? t('stories.page.fold.collapse') : t('stories.page.fold.expand')}
            onToggle={() => setFoldOpen(!foldOpen)}
            expandedLabel={t('stories.page.fold.collapse')}
            data-testid={`${testId}-beats-toggle`}
          >
            {t('stories.page.fold.expand')}
          </DisclosureButton>{' '}
          {t('stories.scene.beats')} <HeadingCount n={beats.length} look="pill" />
        </span>
      }
    >
      <FactList
        look="inline"
        id={foldBodyId}
        aria-labelledby={labelId}
        hidden={!foldOpen}
        data-fold={foldBodyId}
        testId={`${testId}-beats`}
      >
        {beats.map((beat) => (
          <Fact key={beat.id} name={<bdi>{beat.title}</bdi>} testId={`${testId}-beat`}>
            {beat.note}
          </Fact>
        ))}
      </FactList>
    </Fact>
  )
}
