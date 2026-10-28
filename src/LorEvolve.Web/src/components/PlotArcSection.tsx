import { useId, type ReactNode } from 'react'
import { useUniverseAccess } from '../universes/access'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { arcLabel, arcNumber, beatCountLabel } from '../stories/format'
import type { PlotArc } from '../stories/types'

interface PlotArcSectionProps {
  arc: PlotArc
  /** The arc's place in the plot, from 0 - which is also its number, plus one. */
  index: number
  count: number
  onMove: (arc: PlotArc, by: -1 | 1) => void
  onAddBeat: (arc: PlotArc) => void
  onEdit: (arc: PlotArc, index: number) => void
  onDelete: (arc: PlotArc, index: number) => void
  /** The arc's beats, already drawn. */
  children: ReactNode
  /** The arc's publication control (ADR 0039), drawn first among its tools. */
  publication?: ReactNode
}

/**
 * One arc in a story's plot: a heading - "Arc 2: Fall of the King", the number from its position and the name as
 * written - its description, and its beats beneath it. Notes stay in the form.
 *
 * A heading and a rule rather than a box, so an arc groups its beats without a card around rows. Its one direct action
 * is Add beat; Edit arc, the moves that can be made from here and Delete arc, last, are in its ⋯ menu.
 */
export function PlotArcSection({
  arc,
  index,
  count,
  onMove,
  onAddBeat,
  onEdit,
  onDelete,
  children,
  publication,
}: PlotArcSectionProps) {
  const access = useUniverseAccess()
  const headingId = useId()
  const beatCount = arc.beats.length

  return (
    <section
      className="plotarc"
      id={`arc-${arc.id}`}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid="plot-arc"
      data-title={arc.title}
    >
      <header className="plotarc__head">
        <div className="chapter__heading">
          <h3 className="plotarc__title" id={headingId} data-testid="plot-arc-heading">
            <span className="plotarc__number">{arcNumber(index)}</span>
            <span className="plotarc__dash">: </span>
            <span className="plotarc__name">
              <bdi>{arc.title}</bdi>
            </span>
          </h3>
          {beatCount > 0 ? (
            <p className="plotarc__meta" data-testid="plot-arc-beat-count">
              {beatCountLabel(beatCount)}
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
                onClick={() => onAddBeat(arc)}
                aria-describedby={headingId}
                data-testid="plot-arc-new-beat"
              >
                <ActionIcon icon={Plus} />
                Add beat
              </button>
              <ActionMenu
                label={`More actions for ${arcLabel(index, arc.title)}`}
                triggerTestId="plot-arc-actions"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => onEdit(arc, index)}
                  data-testid="plot-arc-edit"
                >
                  <ActionIcon icon={Pencil} />
                  Edit arc
                </button>
                {index > 0 ? (
                  <button
                    className="actionmenu__item"
                    type="button"
                    onClick={() => onMove(arc, -1)}
                    data-testid="plot-arc-move-up"
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
                    data-testid="plot-arc-move-down"
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
                  data-testid="plot-arc-delete"
                >
                  <ActionIcon icon={Trash} />
                  Delete arc
                </button>
              </ActionMenu>
            </>
          ) : null}
        </div>

        {arc.description ? (
          <p className="plotarc__description prose" data-testid="plot-arc-description">
            {arc.description}
          </p>
        ) : null}
      </header>

      {beatCount > 0 ? (
        children
      ) : (
        <p className="plotarc__empty" data-testid="plot-arc-empty">
          No beats yet.
        </p>
      )}
    </section>
  )
}
