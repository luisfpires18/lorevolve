import { GuardMark } from '../SystemMachineTry'
import { useI18n } from '../../i18n'
import type { MachineTransition, Point } from '../../worldLogic/machine'
import { markText, type GuardMarkValue } from '../../worldLogic/markText'
import type { usePanZoom } from '../../lib/usePanZoom'
import type { MachineSelection } from '../SystemMachineCanvas'

/** One transition's label on the canvas: a button that opens it, with its mark for the entry being tried. */
export function MachineLineLabel({
  transition,
  start,
  end,
  from,
  to,
  selected,
  marks,
  beginItemDrag,
  onOpen,
}: {
  transition: MachineTransition
  start: Point
  end: Point
  from: string
  to: string
  selected: MachineSelection
  marks: Map<string, GuardMarkValue>
  beginItemDrag: ReturnType<typeof usePanZoom>['beginItemDrag']
  onOpen: (selection: NonNullable<MachineSelection>) => void
}) {
  const { t } = useI18n()
  const isSelected = selected?.kind === 'transition' && selected.id === transition.id
  const text = transition.label.trim()
  const mark = marks.get(transition.id)
  const name = t('canon.worldLogic.systems.machine.transition', {
    label: text || t('canon.worldLogic.systems.machine.noLabel'),
    from,
    to,
  })
  return (
    <button
      key={transition.id}
      type="button"
      className="machinecanvas__label"
      style={{ left: `${(start.x + end.x) / 2}px`, top: `${(start.y + end.y) / 2}px` }}
      aria-label={mark ? `${name}, ${markText(mark)}` : name}
      aria-pressed={isSelected}
      data-empty={text === '' || undefined}
      data-mark={mark?.kind}
      data-testid="machine-label"
      data-transition-id={transition.id}
      onPointerDown={(event) =>
        beginItemDrag(event, {
          onMove: () => {},
          onEnd: (moved) => {
            if (!moved) onOpen({ kind: 'transition', id: transition.id })
          },
        })
      }
      onClick={(event) => {
        if (event.detail === 0) onOpen({ kind: 'transition', id: transition.id })
      }}
    >
      <bdi>{text || t('canon.worldLogic.systems.machine.noLabel')}</bdi>
      {mark ? <GuardMark mark={mark} /> : null}
    </button>
  )
}
