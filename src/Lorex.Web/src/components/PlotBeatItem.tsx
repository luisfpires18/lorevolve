import { useId } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowUp, BookOpen, Pencil, PenLine, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { LoreReference } from './LoreReference'
import { containerNumber } from '../stories/format'
import type { Chapter, PlotBeat, Scene } from '../stories/types'

interface PlotBeatItemProps {
  universeId: string
  storyId: string
  beat: PlotBeat
  /** The beat's place in its arc, from 0 - the list's own order. */
  index: number
  /** How many beats its arc holds. */
  count: number
  /** Every scene of the story, in reading order: how the beat's scene ids are named. */
  scenes: Scene[]
  chapters: Chapter[]
  onMove: (beat: PlotBeat, by: -1 | 1) => void
  onEdit: (beat: PlotBeat) => void
  onDelete: (beat: PlotBeat) => void
}

/**
 * One beat in its arc: its number, what develops, the scenes it plays out in and the lore it concerns. Notes stay in
 * the form. Edit is the one direct action - Edit beat; the moves that can be made from here
 * and Delete beat, last, are in its ⋯ menu.
 *
 * Each scene is named from the story as it is now - its title, and its chapter when the story has chapters - and
 * links to that scene on the story's Scenes view, with its manuscript one step away beside it; each entry links to its own
 * page. The beat stores only ids, so a
 * scene moved to another chapter simply shows its new chapter here.
 *
 * The row takes the focus without being in the tab order, so a scene's plot chip can land a keyboard on it.
 */
export function PlotBeatItem({
  universeId,
  storyId,
  beat,
  index,
  count,
  scenes,
  chapters,
  onMove,
  onEdit,
  onDelete,
}: PlotBeatItemProps) {
  const access = useUniverseAccess()
  const titleId = useId()
  const scenesLabelId = useId()
  const loreLabelId = useId()

  const linked = new Set(beat.sceneIds)
  const linkedScenes = scenes.filter((scene) => linked.has(scene.id))

  return (
    <li
      className="beat"
      id={`beat-${beat.id}`}
      tabIndex={-1}
      data-testid="plot-beat"
      data-title={beat.title}
    >
      <span className="beat__number" aria-hidden="true">
        {index + 1}
      </span>

      <div className="beat__body">
        <h4 className="beat__title" id={titleId}>
          <span className="visually-hidden">Beat {index + 1}: </span>
          <bdi>{beat.title}</bdi>
        </h4>

        {beat.description ? <p className="beat__description prose">{beat.description}</p> : null}

        {linkedScenes.length > 0 ? (
          <div className="beat__refs">
            <span className="beat__label" id={scenesLabelId}>
              Scenes
            </span>
            <ul
              className="beat__chips"
              aria-labelledby={scenesLabelId}
              data-testid="plot-beat-scenes"
            >
              {linkedScenes.map((scene) => (
                <li key={scene.id}>
                  <Link
                    className="lorechip"
                    to={`/app/universes/${universeId}/stories/${storyId}#scene-${scene.id}`}
                    data-testid="plot-beat-scene"
                    data-title={scene.title}
                  >
                    <span className="lorechip__name">
                      <bdi>{scene.title}</bdi>
                    </span>
                    {chapters.length > 0 ? (
                      <span className="lorechip__note beat__where">
                        {containerNumber(chapters, scene.chapterId)}
                      </span>
                    ) : null}
                  </Link>
                  <Link
                    className="beat__write"
                    to={`/app/universes/${universeId}/stories/${storyId}/manuscript/${scene.id}`}
                    aria-label={`Manuscript of “${scene.title}”`}
                    title="Manuscript"
                    data-testid="plot-beat-scene-manuscript"
                  >
                    <ActionIcon icon={access.editContent ? PenLine : BookOpen} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {beat.entities.length > 0 ? (
          <div className="beat__refs">
            <span className="beat__label" id={loreLabelId}>
              Lore
            </span>
            <ul className="beat__chips" aria-labelledby={loreLabelId} data-testid="plot-beat-lore">
              {beat.entities.map((reference) => (
                <li key={reference.entityId}>
                  <LoreReference universeId={universeId} reference={reference} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {access.editContent ? (
        <div className="beat__tools rowtools">
          <button
            className="button button--text"
            type="button"
            onClick={() => onEdit(beat)}
            aria-describedby={titleId}
            data-testid="plot-beat-edit"
          >
            <ActionIcon icon={Pencil} />
            Edit beat
          </button>
          <ActionMenu label={`More actions for ${beat.title}`} triggerTestId="plot-beat-actions">
            {index > 0 ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onMove(beat, -1)}
                data-testid="plot-beat-move-up"
              >
                <ActionIcon icon={ArrowUp} />
                Move up
              </button>
            ) : null}
            {index < count - 1 ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onMove(beat, 1)}
                data-testid="plot-beat-move-down"
              >
                <ActionIcon icon={ArrowDown} />
                Move down
              </button>
            ) : null}
            {count > 1 ? <hr className="actionmenu__divider" /> : null}
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              onClick={() => onDelete(beat)}
              data-testid="plot-beat-delete"
            >
              <ActionIcon icon={Trash} />
              Delete beat
            </button>
          </ActionMenu>
        </div>
      ) : null}
    </li>
  )
}
