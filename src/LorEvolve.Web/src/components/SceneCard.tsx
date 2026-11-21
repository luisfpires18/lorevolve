import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { ArrowRightLeft, BookOpen, FilePenLine, ListPlus, PenLine, Pencil } from 'lucide-react'
import { ActionMenuItem } from './ActionMenu'
import { useFold } from './fold'
import { TypeRow } from './TypeRow'
import { TypeRowActions } from './TypeRowActions'
import { FactList } from './FactList'
import { ContainerName } from './ContainerName'
import { SceneBeatList, SceneLore, SceneStamp } from './SceneContext'
import type { Chronology } from '../chronology/types'
import { chapterLabel, hasStamp, unchaptered } from '../stories/format'
import type { Scene } from '../stories/types'
import { storyProjectPath } from '../projects/sections'
import { Button } from './Button'

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
  const { open, setOpen, ref, bodyId } = useFold<HTMLLIElement>()
  // Only a scene with something under its title folds.
  const foldable = Boolean(scene.summary) || scene.entities.length > 0 || scene.beats.length > 0
  const hasMenu = access.editContent || access.suggestChanges

  return (
    <TypeRow
      ref={ref}
      id={`scene-${scene.id}`}
      tabIndex={-1}
      data-title={scene.title}
      testId="scene"
      name={scene.title}
      // The number is read, not drawn. It is the heading's accessible name, as one message rather than a
      // prefix glued to the title, so a translation may put the two in its own order; the title itself is
      // drawn once and keeps its own direction.
      heading={{
        level: titleLevel,
        id: titleId,
        label: t('stories.scene.heading', { n: index + 1, title: scene.title }),
      }}
      lead={<span aria-hidden="true">{index + 1}</span>}
      actions={
        <>
          {publication}
          {access.editContent ? (
            <Button
              tone="text"
              icon={Pencil}
              onClick={() => onEdit(scene)}
              aria-describedby={titleId}
              data-testid="scene-edit"
            >
              {t('stories.scene.edit')}
            </Button>
          ) : null}
          <Button
            tone="text"
            icon={access.editContent ? PenLine : BookOpen}
            to={storyProjectPath(universeId, scene.storyId, 'manuscript', scene.id)}
            aria-describedby={titleId}
            data-testid="scene-write"
          >
            {access.editContent ? t('stories.scene.write') : t('stories.scene.read')}
          </Button>
          <TypeRowActions
            name={scene.title}
            move={
              access.editContent
                ? {
                    isFirst: index === 0,
                    isLast: index === count - 1,
                    busy: false,
                    onMove: (direction) => onMove(scene, direction === 'up' ? -1 : 1),
                  }
                : undefined
            }
            moveTestIds={{ up: 'scene-move-up', down: 'scene-move-down' }}
            fold={
              foldable
                ? {
                    open: open,
                    count: 0,
                    onToggle: () => setOpen(!open),
                    testId: 'scene-toggle',
                    controls: bodyId,
                    label: t('stories.scene.foldLabel', { n: index + 1, title: scene.title }),
                  }
                : undefined
            }
            words={{ more: t('stories.scene.moreActions', { title: scene.title }) }}
            menuItems={
              hasMenu ? (
                <>
                  {access.suggestChanges && !access.editContent ? (
                    <ActionMenuItem
                      icon={FilePenLine}
                      onClick={() => onSuggest(scene)}
                      testId="scene-suggest"
                    >
                      {t('stories.scene.suggest')}
                    </ActionMenuItem>
                  ) : null}
                  {(access.editContent ? moveTargets : []).map((target) => (
                    <ActionMenuItem
                      icon={ArrowRightLeft}
                      key={target.chapterId ?? 'unchaptered'}
                      onClick={() => onMoveTo(scene, target.chapterId)}
                      testId="scene-move-to-option"
                      data-target={
                        (target.arc ? `${target.arc}, ` : '') +
                        (target.chapter
                          ? chapterLabel(target.chapter.index, target.chapter.title)
                          : unchaptered())
                      }
                    >
                      {tx('stories.scene.moveTo', {
                        target: (
                          <>
                            {target.arc ? `${target.arc}, ` : null}
                            <ContainerName chapter={target.chapter} />
                          </>
                        ),
                      })}
                    </ActionMenuItem>
                  ))}
                  {access.editContent ? (
                    <ActionMenuItem
                      icon={ListPlus}
                      onClick={() => onAddBeat(scene)}
                      testId="scene-add-beat"
                    >
                      {t('stories.scene.addBeat')}
                    </ActionMenuItem>
                  ) : null}
                </>
              ) : undefined
            }
            onDelete={access.editContent ? () => onDelete(scene) : undefined}
            deleteLabel={t('stories.scene.delete')}
            deleteTestId="scene-delete"
            menuTestId="scene-actions"
          />
        </>
      }
    >
      {hasStamp(chronology, scene) ? (
        <FactList look="inline">
          <SceneStamp
            universeId={universeId}
            chronology={chronology}
            scene={scene}
            testId="scene"
          />
        </FactList>
      ) : null}
      <div id={bodyId} hidden={foldable && !open} data-fold={bodyId}>
        {scene.summary ? (
          <p className="types__description prose" data-testid="scene-summary">
            {scene.summary}
          </p>
        ) : null}
        {scene.entities.length > 0 || scene.beats.length > 0 ? (
          <FactList look="inline">
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
          </FactList>
        ) : null}
      </div>
    </TypeRow>
  )
}
