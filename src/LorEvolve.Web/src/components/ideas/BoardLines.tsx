import type { BoardCard, BoardConnection } from '../../ideas/boards'
import type { BoardSelection } from '../../ideas/boardSelection'
import type { usePanZoom } from '../../lib/usePanZoom'

/** The board's lines: one SVG under the cards, each line pressed to choose it. */
export function BoardLines({
  connections,
  byId,
  selected,
  beginItemDrag,
  onSelect,
}: Pick<ReturnType<typeof usePanZoom>, 'beginItemDrag'> & {
  connections: BoardConnection[]
  byId: Map<string, BoardCard>
  selected: BoardSelection
  onSelect: (selection: BoardSelection) => void
}) {
  return (
    <svg className="boardcanvas__lines" width="1" height="1" aria-hidden="true">
      {connections.map((line) => {
        const from = byId.get(line.fromCardId)
        const to = byId.get(line.toCardId)
        if (!from || !to) return null
        const x1 = from.x + from.width / 2
        const y1 = from.y + from.height / 2
        const x2 = to.x + to.width / 2
        const y2 = to.y + to.height / 2
        const isSelected = selected?.kind === 'line' && selected.id === line.id
        return (
          <g
            key={line.id}
            className="boardline"
            data-selected={isSelected || undefined}
            data-testid="board-line"
            data-line-id={line.id}
            onPointerDown={(event) =>
              beginItemDrag(event, {
                onMove: () => {},
                onEnd: (moved) => {
                  if (!moved) onSelect({ kind: 'line', id: line.id })
                },
              })
            }
          >
            <line className="boardline__hit" x1={x1} y1={y1} x2={x2} y2={y2} />
            <line className="boardline__stroke" x1={x1} y1={y1} x2={x2} y2={y2} />
            {line.label ? (
              <text className="boardline__label" x={(x1 + x2) / 2} y={(y1 + y2) / 2}>
                {line.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
