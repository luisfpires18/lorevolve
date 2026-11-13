import { useId, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowRightLeft, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { useFold } from './fold'
import { FoldToggle } from './FoldToggle'
import { chapterLabel, chapterNumber, sceneCountLabel } from '../stories/format'
import type { Chapter } from '../stories/types'

/** An arc a chapter may move into, or no arc at all when `id` is null, named as the menu reads it. */
export interface ArcTarget {
  id: string | null
  label: string
}

interface ChapterSectionProps {
  chapter: Chapter
  /** The chapter's place inside its arc - or among the chapters in no arc - from 0: its number, plus one. */
  index: number
  count: number
  sceneCount: number
  /** The heading's level: 3 on its own, 4 inside an arc. */
  titleLevel?: 3 | 4
  /** Every other place the chapter may move to: each other arc, and no arc (ADR 0070). */
  arcTargets?: ArcTarget[]
  onMoveToArc?: (chapter: Chapter, arcId: string | null) => void
  onMove: (chapter: Chapter, by: -1 | 1) => void
  onAddScene: (chapter: Chapter) => void
  onEdit: (chapter: Chapter, index: number) => void
  onDelete: (chapter: Chapter, index: number) => void
  /** The chapter's scenes, already drawn. */
  children: ReactNode
}

/**
 * One chapter on its story's page: a modest heading - "Chapter 2: Ashes", the number from its position in its arc
 * and the name as written - its summary, and its scenes beneath it. Notes stay in the form. Its ⋯ menu also moves it
 * into another arc, or out of every arc (ADR 0070).
 *
 * A heading and a rule rather than a box, so a chapter groups its scenes without putting a card around
 * cards. Its one direct action is Add scene, which starts a scene in this chapter; Edit chapter, the moves
 * that can be made from here and Delete chapter, last, are in its ⋯ menu, named with the chapter.
 */
export function ChapterSection({
  chapter,
  index,
  count,
  sceneCount,
  titleLevel = 3,
  arcTargets = [],
  onMoveToArc,
  onMove,
  onAddScene,
  onEdit,
  onDelete,
  children,
}: ChapterSectionProps) {
  const access = useUniverseAccess()
  const headingId = useId()
  const Title = titleLevel === 4 ? 'h4' : 'h3'
  const {
    open: foldOpen,
    setOpen: setFoldOpen,
    ref: foldRef,
    bodyId: foldBodyId,
  } = useFold<HTMLElement>()

  return (
    <section
      ref={foldRef}
      className="chapter"
      id={`chapter-${chapter.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="chapter"
      data-title={chapter.title}
      data-open={foldOpen ? 'true' : undefined}
    >
      <header className="chapter__head">
        <div className="chapter__heading">
          <FoldToggle
            open={foldOpen}
            onToggle={setFoldOpen}
            controls={foldBodyId}
            label={chapterLabel(index, chapter.title)}
            testId="chapter-toggle"
          />
          <Title className="chapter__title" id={headingId} data-testid="chapter-heading">
            <span className="chapter__number">{chapterNumber(index)}</span>
            <span className="chapter__dash">: </span>
            <span className="chapter__name">
              <bdi>{chapter.title}</bdi>
            </span>
          </Title>
          {sceneCount > 0 ? (
            <p className="chapter__meta" data-testid="chapter-scene-count">
              {sceneCountLabel(sceneCount)}
            </p>
          ) : null}
        </div>

        {access.editContent ? (
          <div className="chapter__tools rowtools">
            <button
              className="button button--text"
              type="button"
              onClick={() => {
                setFoldOpen(true)
                onAddScene(chapter)
              }}
              aria-describedby={headingId}
              data-testid="chapter-new-scene"
            >
              <ActionIcon icon={Plus} />
              Add scene
            </button>
            <ActionMenu
              label={`More actions for ${chapterLabel(index, chapter.title)}`}
              triggerTestId="chapter-actions"
            >
              <button
                className="actionmenu__item"
                type="button"
                onClick={() => onEdit(chapter, index)}
                data-testid="chapter-edit"
              >
                <ActionIcon icon={Pencil} />
                Edit chapter
              </button>
              {index > 0 ? (
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => onMove(chapter, -1)}
                  data-testid="chapter-move-up"
                >
                  <ActionIcon icon={ArrowUp} />
                  Move up
                </button>
              ) : null}
              {index < count - 1 ? (
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => onMove(chapter, 1)}
                  data-testid="chapter-move-down"
                >
                  <ActionIcon icon={ArrowDown} />
                  Move down
                </button>
              ) : null}
              {onMoveToArc
                ? arcTargets.map((target) => (
                    <button
                      key={target.id ?? 'no-arc'}
                      className="actionmenu__item"
                      type="button"
                      onClick={() => onMoveToArc(chapter, target.id)}
                      data-testid="chapter-move-to-arc"
                    >
                      <ActionIcon icon={ArrowRightLeft} />
                      {target.id === null ? 'Move out of its arc' : `Move to ${target.label}`}
                    </button>
                  ))
                : null}
              <hr className="actionmenu__divider" />
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                onClick={() => onDelete(chapter, index)}
                data-testid="chapter-delete"
              >
                <ActionIcon icon={Trash} />
                Delete chapter
              </button>
            </ActionMenu>
          </div>
        ) : null}

        {chapter.summary ? (
          <p className="chapter__summary prose" hidden={!foldOpen} data-testid="chapter-summary">
            {chapter.summary}
          </p>
        ) : null}
      </header>

      <div id={foldBodyId} hidden={!foldOpen}>
        {sceneCount > 0 ? (
          children
        ) : (
          <p className="chapter__empty" data-testid="chapter-empty">
            No scenes in this chapter yet.
          </p>
        )}
      </div>
    </section>
  )
}
