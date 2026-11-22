import {
  STATE_HEIGHT,
  STATE_WIDTH,
  type MachineTransition,
  type Point,
} from '../../worldLogic/machine'
import type { SystemMachineState } from '../../worldLogic/types'
import type { usePanZoom } from '../../lib/usePanZoom'
import type { MachineSelection } from '../SystemMachineCanvas'
import { CanvasLine } from '../CanvasStage'

/** The canvas's drawing: the arrowheads, one line per transition, and the line being drawn from a handle. */
export function MachineLines({
  headId,
  lines,
  selected,
  beginItemDrag,
  onOpen,
  pendingFrom,
  pending,
}: {
  headId: string
  lines: { transition: MachineTransition; start: Point; end: Point; from: string; to: string }[]
  selected: MachineSelection
  beginItemDrag: ReturnType<typeof usePanZoom>['beginItemDrag']
  onOpen: (selection: NonNullable<MachineSelection>) => void
  pendingFrom: SystemMachineState | undefined
  pending: { from: string; to: Point } | null
}) {
  return (
    <svg className="boardcanvas__lines" width="1" height="1" aria-hidden="true">
      <defs>
        {[false, true].map((isSelected) => (
          <marker
            key={String(isSelected)}
            id={isSelected ? `${headId}-selected` : headId}
            className="machinecanvas__head"
            data-selected={isSelected || undefined}
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" />
          </marker>
        ))}
      </defs>
      {lines.map(({ transition, start, end }) => {
        const isSelected = selected?.kind === 'transition' && selected.id === transition.id
        return (
          <CanvasLine
            key={transition.id}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            selected={isSelected}
            testId="machine-line"
            data={{ 'data-transition-id': transition.id }}
            beginItemDrag={beginItemDrag}
            onPress={() => onOpen({ kind: 'transition', id: transition.id })}
            markerEnd={`url(#${isSelected ? `${headId}-selected` : headId})`}
          />
        )
      })}
      {pendingFrom && pending ? (
        <line
          className="boardline__stroke"
          x1={pendingFrom.x + STATE_WIDTH}
          y1={pendingFrom.y + STATE_HEIGHT / 2}
          x2={pending.to.x}
          y2={pending.to.y}
          strokeDasharray="6 4"
          pointerEvents="none"
          data-testid="machine-pending-line"
        />
      ) : null}
    </svg>
  )
}
