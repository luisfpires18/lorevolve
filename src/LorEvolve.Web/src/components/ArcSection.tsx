import { useId, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { arcLabel, arcNumber, chapterCountLabel } from '../stories/format'
import type { PlotArc } from '../stories/types'

interface ArcSectionProps {
  arc: PlotArc
  /** The arc's place in the story, from 0 - which is also its number, plus one. */
  index: number
  count: number
  /** How many chapters are told in it. */
  chapterCount: number
  onMove: (arc: PlotArc, by: -1 | 1) => void
  onAddChapter: (arc: PlotArc) => void
  onEdit: (arc: PlotArc, index: number) => void
  onDelete: (arc: PlotArc, index: number) => void
  /** The arc's chapters, already drawn. */
  children: ReactNode
  /** The arc's publication control (ADR 0039), drawn first among its tools. */
  publication?: ReactNode
}

/**
 * One arc of a story (ADR 0070): a heading - "Arc 2: Fall of the King", the number from its position and the name as
 * written - its description, and its chapters beneath it, numbered again from 1. Notes stay in the form.
 *
 * A heading and a rule rather than a box, so an arc groups its chapters without a card around them. Its one direct action
 * is Add chapter; Edit arc, the moves that can be made from here and Delete arc, last, are in its ⋯ menu.
 */
export function ArcSection({
  arc,
  index,
  count,
  chapterCount,
  onMove,
  onAddChapter,
  onEdit,
  onDelete,
  children,
  publication,
}: ArcSectionProps) {
  const access = useUniverseAccess()
  const headingId = useId()

  return (
    <section
      className="plotarc"
      id={`arc-${arc.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="arc"
      data-title={arc.title}
    >
      <header className="plotarc__head">
        <div className="chapter__heading">
          <h3 className="plotarc__title" id={headingId} data-testid="arc-heading">
            <span className="plotarc__number">{arcNumber(index)}</span>
            <span className="plotarc__dash">: </span>
            <span className="plotarc__name">
              <bdi>{arc.title}</bdi>
            </span>
          </h3>
          {chapterCount > 0 ? (
            <p className="plotarc__meta" data-testid="arc-chapter-count">
              {chapterCountLabel(chapterCount)}
            </p>
          ) : null}
        </div>

        <div className="plotarc__tools rowtools">
          {publication}
          {access.editContent ? (
            <>
              <button
                className="button button--text"
                type="button"
                onClick={() => onAddChapter(arc)}
                aria-describedby={headingId}
                data-testid="arc-new-chapter"
              >
                <ActionIcon icon={Plus} />
                Add chapter
              </button>
              <ActionMenu
                label={`More actions for ${arcLabel(index, arc.title)}`}
                triggerTestId="arc-actions"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => onEdit(arc, index)}
                  data-testid="arc-edit"
                >
                  <ActionIcon icon={Pencil} />
                  Edit arc
                </button>
                {index > 0 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => onMove(arc, -1)}
                    data-testid="arc-move-up"
                  >
                    <ActionIcon icon={ArrowUp} />
                    Move up
                  </button>
                ) : null}
                {index < count - 1 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => onMove(arc, 1)}
                    data-testid="arc-move-down"
                  >
                    <ActionIcon icon={ArrowDown} />
                    Move down
                  </button>
                ) : null}
                <hr className="actionmenu__divider" />
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  onClick={() => onDelete(arc, index)}
                  data-testid="arc-delete"
                >
                  <ActionIcon icon={Trash} />
                  Delete arc
                </button>
              </ActionMenu>
            </>
          ) : null}
        </div>

        {arc.description ? (
          <p className="plotarc__description prose" data-testid="arc-description">
            {arc.description}
          </p>
        ) : null}
      </header>

      {chapterCount > 0 ? (
        children
      ) : (
        <p className="plotarc__empty" data-testid="arc-empty">
          No chapters in this arc yet. Add one with New chapter, or move one here: Edit chapter,
          then choose this arc, or Move to from the chapter&rsquo;s ⋯ menu.
        </p>
      )}
    </section>
  )
}
