import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BookOpen,
  FilePenLine,
  ListPlus,
  PenLine,
  Pencil,
  Trash,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { useFold } from './fold'
import { FoldToggle } from './FoldToggle'
import { ContainerName } from './ContainerName'
import { SceneBeatList, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import { chapterLabel, unchaptered } from '../stories/format'
import type { Scene } from '../stories/types'

/** A container a scene can be moved into: a chapter, or Unchaptered when `chapterId` is null. */
export interface MoveTarget {
  chapterId: string | null
  /** The chapter's place and title; null for Unchaptered. */
  chapter: { index: number; title: string } | null
  /** The arc the chapter is told in, as its number reads ("Arc 2"), when it is in one (ADR 0070). */
  arc?: string | null
}

interface SceneCardProps {
  universeId: string
  chronology: Chronology
  scene: Scene
  /** The scene's place in its container's telling, from 0 - the list's own order. */
  index: number
  /** How many scenes its container holds. */
  count: number
  /** 4 under a chapter or Unchaptered heading, 5 under a chapter inside an arc, 3 in a story with no chapters. */
  titleLevel: 3 | 4 | 5
  /** Every other container the scene could move to. Empty in a story with no chapters. */
  moveTargets: MoveTarget[]
  onMove: (scene: Scene, by: -1 | 1) => void
  onMoveTo: (scene: Scene, chapterId: string | null) => void
  onEdit: (scene: Scene) => void
  /** Opens the scene's drawer on a new beat row (ADR 0070). */
  onAddBeat: (scene: Scene) => void
  /** Opens the scene's form to send a suggestion instead of saving (task 045). */
  onSuggest: (scene: Scene) => void
  onDelete: (scene: Scene) => void
  /** The scene's lore in a new order, dragged on the card. Left out, the chips are read-only. */
  onReorderLore?: (scene: Scene, entityIds: string[]) => void
  /** The scene outline's publication control (ADR 0039), drawn first among the scene's tools. */
  publication?: ReactNode
}

/**
 * One scene in its container's list: number, where it happens, whose eyes, what happens, what lore it
 * draws on, its beats in order - and then a few controls, so the scene outweighs its tools.
 *
 * The lore and beat rows are read-only here: both are edited in the scene's own drawer, Edit scene (ADR 0070).
 *
 * Edit scene and Write are the direct actions: Edit scene opens the scene's drawer in place, and Write opens this
 * scene on the Manuscript view - the one editor, at the scene's own address - so a writer never has to find the
 * scene again in the outline. Everything else is in the
 * scene's ⋯ menu: Move up and Move down inside its chapter, one "Move to" item per other chapter
 * (or Unchaptered, last there), Add beat (the drawer, open on a new beat), and Delete scene last, after a divider. Reordering stays plain buttons rather
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
  onMove,
  onMoveTo,
  onEdit,
  onAddBeat,
  onSuggest,
  onDelete,
  onReorderLore,
  publication,
}: SceneCardProps) {
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const titleId = useId()
  const Title = titleLevel === 5 ? 'h5' : titleLevel === 4 ? 'h4' : 'h3'
  const {
    open: foldOpen,
    setOpen: setFoldOpen,
    ref: foldRef,
    bodyId: foldBodyId,
  } = useFold<HTMLLIElement>()
  // Only a scene with something under its title folds.
  const foldable = Boolean(scene.summary) || scene.entities.length > 0 || scene.beats.length > 0

  return (
    <li
      ref={foldRef}
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

        <div className="scene__titlerow">
          {foldable ? (
            <FoldToggle
              open={foldOpen}
              onToggle={setFoldOpen}
              controls={foldBodyId}
              label={t('stories.scene.foldLabel', { n: index + 1, title: scene.title })}
              testId="scene-toggle"
            />
          ) : null}
          <Title className="scene__title" id={titleId}>
            <span className="visually-hidden">{t('stories.scene.number', { n: index + 1 })}</span>
            <bdi>{scene.title}</bdi>
          </Title>
        </div>

        <div id={foldBodyId} hidden={foldable && !foldOpen} data-fold={foldBodyId}>
          {scene.summary ? <p className="scene__summary prose">{scene.summary}</p> : null}

          <SceneLore
            universeId={universeId}
            scene={scene}
            testId="scene"
            onReorder={
              onReorderLore && access.editContent
                ? (entityIds) => onReorderLore(scene, entityIds)
                : undefined
            }
          />
          <SceneBeatList beats={scene.beats} testId="scene" />
        </div>
      </div>

      <div className="scene__tools rowtools">
        {publication}
        {access.editContent ? (
          <button
            className="button button--text"
            type="button"
            onClick={() => onEdit(scene)}
            aria-describedby={titleId}
            data-testid="scene-edit"
          >
            <ActionIcon icon={Pencil} />
            {t('stories.scene.edit')}
          </button>
        ) : null}
        <Link
          className="button button--text"
          to={`/app/universes/${universeId}/stories/${scene.storyId}/manuscript/${scene.id}`}
          aria-describedby={titleId}
          data-testid="scene-write"
        >
          <ActionIcon icon={access.editContent ? PenLine : BookOpen} />
          {access.editContent ? t('stories.scene.write') : t('stories.scene.read')}
        </Link>
        {access.editContent || access.suggestChanges ? (
          <ActionMenu
            label={t('stories.scene.moreActions', { title: scene.title })}
            triggerTestId="scene-actions"
            panelClassName="actionmenu__panel--wide"
          >
            {access.suggestChanges && !access.editContent ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onSuggest(scene)}
                data-testid="scene-suggest"
              >
                <ActionIcon icon={FilePenLine} />
                {t('stories.scene.suggest')}
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
                {t('stories.scene.moveUp')}
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
                {t('stories.scene.moveDown')}
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
                  (target.arc ? `${target.arc}, ` : '') +
                  (target.chapter
                    ? chapterLabel(target.chapter.index, target.chapter.title)
                    : unchaptered())
                }
              >
                <ActionIcon icon={ArrowRightLeft} />
                <span className="actionmenu__text">
                  {tx('stories.scene.moveTo', {
                    target: (
                      <>
                        {target.arc ? `${target.arc}, ` : null}
                        <ContainerName chapter={target.chapter} />
                      </>
                    ),
                  })}
                </span>
              </button>
            ))}
            {access.editContent ? (
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onAddBeat(scene)}
                data-testid="scene-add-beat"
              >
                <ActionIcon icon={ListPlus} />
                {t('stories.scene.addBeat')}
              </button>
            ) : null}
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
                  {t('stories.scene.delete')}
                </button>
              </>
            ) : null}
          </ActionMenu>
        ) : null}
      </div>
    </li>
  )
}
