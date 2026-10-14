import { useId, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  FilePenLine,
  PenLine,
  Pencil,
  Trash,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { ContainerName } from './ContainerName'
import { SceneBeats, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import { chapterLabel, UNCHAPTERED } from '../stories/format'
import type { SceneBeatReference } from '../stories/structure'
import type { Scene } from '../stories/types'

/** A container a scene can be moved into: a chapter, or Unchaptered when `chapterId` is null. */
export interface MoveTarget {
  chapterId: string | null
  /** The chapter's place and title; null for Unchaptered. */
  chapter: { index: number; title: string } | null
}

interface SceneCardProps {
  universeId: string
  chronology: Chronology
  scene: Scene
  /** The scene's place in its container's telling, from 0 - the list's own order. */
  index: number
  /** How many scenes its container holds. */
  count: number
  /** 4 under a chapter or Unchaptered heading, 3 in a story with no chapters. */
  titleLevel: 3 | 4
  /** Every other container the scene could move to. Empty in a story with no chapters. */
  moveTargets: MoveTarget[]
  /** The plot beats that point at this scene, arc by arc. Shown only: a scene holds no beat. */
  beats: SceneBeatReference[]
  onMove: (scene: Scene, by: -1 | 1) => void
  onMoveTo: (scene: Scene, chapterId: string | null) => void
  onEdit: (scene: Scene) => void
  /** Opens the scene's form to send a suggestion instead of saving (task 045). */
  onSuggest: (scene: Scene) => void
  onDelete: (scene: Scene) => void
  /** The scene outline's publication control (ADR 0039), drawn first among the scene's tools. */
  publication?: ReactNode
}

/**
 * One scene in its container's list: number, where it happens, whose eyes, what happens, what lore it
 * draws on, which plot beats point at it - and then two controls, so the scene outweighs its tools.
 *
 * The lore and plot rows are read-only. The beats own those links, so each one is a way to the beat on the
 * story's Plot view rather than something edited here.
 *
 * Write is the one direct action: it opens this scene on the Manuscript view - the one editor, at the scene's
 * own address - so a writer never has to find the scene again in the outline. Everything else is in the
 * scene's ⋯ menu: Edit scene, Move up and Move down inside its chapter, one "Move to" item per other chapter
 * (or Unchaptered, last there), and Delete scene last, after a divider. Reordering stays plain buttons rather
 * than a drag gesture, so it works from a keyboard, a screen reader and a phone alike; a move that cannot be
 * made at this end of the list is not offered. The menu's name carries the scene's title.
 *
 * The row takes the focus - but is never in the tab order - so a link that lands on the scene can put a keyboard
 * and a screen reader there too.
 */
export function SceneCard({
  universeId,
  chronology,
  scene,
  index,
  count,
  titleLevel,
  moveTargets,
  beats,
  onMove,
  onMoveTo,
  onEdit,
  onSuggest,
  onDelete,
  publication,
}: SceneCardProps) {
  const access = useUniverseAccess()
  const titleId = useId()
  const Title = titleLevel === 4 ? 'h4' : 'h3'

  return (
    <li
      className="scene"
      id={`scene-${scene.id}`}
      tabIndex={-1}
      data-testid="scene"
      data-title={scene.title}
    >
      <span className="scene__number" aria-hidden="true">
        {index + 1}
      </span>

      <div className="scene__body">
        <SceneStamp universeId={universeId} chronology={chronology} scene={scene} testId="scene" />

        <Title className="scene__title" id={titleId}>
          <span className="visually-hidden">Scene {index + 1}: </span>
          <bdi>{scene.title}</bdi>
        </Title>

        {scene.summary ? <p className="scene__summary prose">{scene.summary}</p> : null}

        <SceneLore universeId={universeId} scene={scene} testId="scene" />
        <SceneBeats universeId={universeId} storyId={scene.storyId} beats={beats} testId="scene" />
      </div>

      <div className="scene__tools rowtools">
        {publication}
        <Link
          className="button button--text"
          to={`/app/universes/${universeId}/stories/${scene.storyId}/manuscript/${scene.id}`}
          aria-describedby={titleId}
          data-testid="scene-write"
        >
          <ActionIcon icon={access.editContent ? PenLine : BookOpen} />
          {access.editContent ? 'Write' : 'Read'}
        </Link>
        {access.editContent || access.suggestChanges ? (
          <ActionMenu
            label={`More actions for ${scene.title}`}
            triggerTestId="scene-actions"
            panelClassName="actionmenu__panel--wide"
          >
            {access.editContent ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onEdit(scene)}
                data-testid="scene-edit"
              >
                <ActionIcon icon={Pencil} />
                Edit scene
              </button>
            ) : null}
            {access.suggestChanges && !access.editContent ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onSuggest(scene)}
                data-testid="scene-suggest"
              >
                <ActionIcon icon={FilePenLine} />
                Suggest changes
              </button>
            ) : null}
            {access.editContent && index > 0 ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onMove(scene, -1)}
                data-testid="scene-move-up"
              >
                <ActionIcon icon={ArrowUp} />
                Move up
              </button>
            ) : null}
            {access.editContent && index < count - 1 ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onMove(scene, 1)}
                data-testid="scene-move-down"
              >
                <ActionIcon icon={ArrowDown} />
                Move down
              </button>
            ) : null}
            {(access.editContent ? moveTargets : []).map((target) => (
              <button
                key={target.chapterId ?? 'unchaptered'}
                className="actionmenu__item"
                type="button"
                onClick={() => onMoveTo(scene, target.chapterId)}
                data-testid="scene-move-to-option"
                data-target={
                  target.chapter
                    ? chapterLabel(target.chapter.index, target.chapter.title)
                    : UNCHAPTERED
                }
              >
                <ActionIcon icon={ArrowRightLeft} />
                <span className="actionmenu__text">
                  Move to <ContainerName chapter={target.chapter} />
                </span>
              </button>
            ))}
            {access.editContent ? (
              <>
                <hr className="actionmenu__divider" />
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  onClick={() => onDelete(scene)}
                  data-testid="scene-delete"
                >
                  <ActionIcon icon={Trash} />
                  Delete scene
                </button>
              </>
            ) : null}
          </ActionMenu>
        ) : null}
      </div>
    </li>
  )
}
