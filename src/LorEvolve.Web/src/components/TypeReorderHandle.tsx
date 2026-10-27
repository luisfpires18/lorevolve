import type { KeyboardEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'

/**
 * The grip a type is reordered by on a wide screen, and only the grip: the row around it stays text to select and buttons to
 * press. A mouse drags it (`@dnd-kit/core`'s mouse sensor - never a touch, which a phone needs for scrolling); a keyboard
 * lifts it with Space or Enter, moves it with the arrow keys among its own siblings, and drops it with Space or Enter again
 * or puts it back with Escape. Where it may go is the Types screen's to say (`onKey`); this is the control.
 */
export function TypeReorderHandle({
  id,
  name,
  lifted,
  disabled,
  onKey,
  onLeave,
  buttonRef,
}: {
  id: string
  name: string
  /** Being carried from the keyboard. */
  lifted: boolean
  disabled: boolean
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
  /** The focus left the grip: a keyboard carry still in progress is put back. */
  onLeave: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })

  return (
    <button
      {...attributes}
      {...listeners}
      ref={(element) => {
        setNodeRef(element)
        buttonRef(element)
      }}
      className="types__handle"
      type="button"
      aria-label={`Reorder ${name}`}
      aria-pressed={lifted || isDragging}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey}
      onBlur={onLeave}
      data-testid={`reorder-${name}`}
    >
      <GripVertical aria-hidden="true" focusable="false" strokeWidth={1.75} />
    </button>
  )
}
