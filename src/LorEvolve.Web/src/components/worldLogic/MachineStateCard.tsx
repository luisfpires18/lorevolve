import { Plus } from 'lucide-react'
import { StatusBadge } from '../StatusBadge'
import { useI18n } from '../../i18n'
import { STATE_HEIGHT, STATE_WIDTH } from '../../worldLogic/machine'
import type { SystemMachineState } from '../../worldLogic/types'
import type { usePanZoom } from '../../lib/usePanZoom'
import type { machineCanvasActions } from '../../worldLogic/machineCanvasActions'
import type { MachineSelection } from '../SystemMachineCanvas'

type Actions = ReturnType<typeof machineCanvasActions>

/** One state on the canvas: its card, its open findings, and the handle a transition is drawn from. */
export function MachineStateCard({
  state,
  selected,
  connecting,
  dragging,
  counts,
  beginItemDrag,
  stateDrag,
  handleDrag,
  press,
  onStateKeyDown,
  onConnectFrom,
}: {
  state: SystemMachineState
  selected: MachineSelection
  connecting: string | null
  dragging: { id: string; x: number; y: number } | null
  counts: Map<string, number>
  beginItemDrag: ReturnType<typeof usePanZoom>['beginItemDrag']
  stateDrag: Actions['stateDrag']
  handleDrag: Actions['handleDrag']
  press: Actions['press']
  onStateKeyDown: Actions['onStateKeyDown']
  onConnectFrom: (stateId: string | null) => void
}) {
  const { t, tn } = useI18n()
  const isSelected = selected?.kind === 'state' && selected.id === state.id
  const label = t(
    state.initial
      ? 'canon.worldLogic.systems.machine.stateInitial'
      : 'canon.worldLogic.systems.machine.state',
    { name: state.name, value: state.value },
  )
  const count = counts.get(state.id) ?? 0
  const findings = count
    ? tn('canon.worldLogic.systems.machine.openFindings', count, { count })
    : null
  return [
    <button
      key={state.id}
      type="button"
      className="boardcard"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
        width: `${STATE_WIDTH}px`,
        height: `${STATE_HEIGHT}px`,
      }}
      aria-label={findings ? `${label}, ${findings}` : label}
      aria-pressed={isSelected}
      data-connecting-from={connecting === state.id || undefined}
      data-dragging={dragging?.id === state.id || undefined}
      data-testid="machine-state"
      data-state-id={state.id}
      data-name={state.name}
      onPointerDown={(event) => beginItemDrag(event, stateDrag(state))}
      onClick={(event) => {
        // A pointer press is handled on release; the keyboard's Enter and Space land here.
        if (event.detail === 0) press(state)
      }}
      onKeyDown={(event) => onStateKeyDown(event, state)}
    >
      <span className="boardcard__kind" aria-hidden="true">
        {state.initial
          ? `${t('canon.worldLogic.systems.machine.initial')} · ${state.value}`
          : state.value}
      </span>
      <span className="boardcard__name" aria-hidden="true">
        <bdi>{state.name}</bdi>
      </span>
    </button>,
    // Outside the card, which clips, and named by the card's own label, so hidden here.
    findings ? (
      <span
        key={`${state.id}-findings`}
        className="machinecanvas__findings"
        style={{ left: `${state.x + STATE_WIDTH - 12}px`, top: `${state.y}px` }}
        aria-hidden="true"
      >
        <StatusBadge step={1} label={findings} testId="machine-state-findings" />
      </span>
    ) : null,
    <button
      key={`${state.id}-handle`}
      type="button"
      className="machinecanvas__handle"
      style={{
        left: `${state.x + STATE_WIDTH - 12}px`,
        top: `${state.y + STATE_HEIGHT / 2 - 12}px`,
      }}
      aria-label={t('canon.worldLogic.systems.machine.handle', { name: state.name })}
      aria-pressed={connecting === state.id}
      data-connecting-from={connecting === state.id || undefined}
      data-testid="machine-handle"
      data-handle-id={state.id}
      onPointerDown={(event) => beginItemDrag(event, handleDrag(state))}
      onClick={(event) => {
        if (event.detail === 0) onConnectFrom(connecting === state.id ? null : state.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && connecting) {
          event.preventDefault()
          event.stopPropagation()
          onConnectFrom(null)
        }
      }}
    >
      <Plus aria-hidden="true" focusable="false" strokeWidth={2} />
    </button>,
  ]
}
