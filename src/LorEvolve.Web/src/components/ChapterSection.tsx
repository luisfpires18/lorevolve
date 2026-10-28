import { useId, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { chapterLabel, chapterNumber, sceneCountLabel } from '../stories/format'
import type { Chapter } from '../stories/types'

interface ChapterSectionProps {
  chapter: Chapter
  /** The chapter's place in the story, from 0 - which is also its number, plus one. */
  index: number
  count: number
  sceneCount: number
  onMove: (chapter: Chapter, by: -1 | 1) => void
  onAddScene: (chapter: Chapter) => void
  onEdit: (chapter: Chapter, index: number) => void
  onDelete: (chapter: Chapter, index: number) => void
  /** The chapter's scenes, already drawn. */
  children: ReactNode
}

/**
 * One chapter on its story's page: a modest heading - "Chapter 2: Ashes", the number from its position
 * and the name as written - its summary, and its scenes beneath it. Notes stay in the form.
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
  onMove,
  onAddScene,
  onEdit,
  onDelete,
  children,
}: ChapterSectionProps) {
  const access = useUniverseAccess()
  const headingId = useId()

  return (
    <section
      className="chapter"
      id={`chapter-${chapter.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="chapter"
      data-title={chapter.title}
    >
      <header className="chapter__head">
        <div className="chapter__heading">
          <h3 className="chapter__title" id={headingId} data-testid="chapter-heading">
            <span className="chapter__number">{chapterNumber(index)}</span>
            <span className="chapter__dash">: </span>
            <span className="chapter__name">
              <bdi>{chapter.title}</bdi>
            </span>
          </h3>
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
              onClick={() => onAddScene(chapter)}
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
          <p className="chapter__summary prose" data-testid="chapter-summary">
            {chapter.summary}
          </p>
        ) : null}
      </header>

      {sceneCount > 0 ? (
        children
      ) : (
        <p className="chapter__empty" data-testid="chapter-empty">
          No scenes in this chapter yet.
        </p>
      )}
    </section>
  )
}
