import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

/**
 * One card on a pan and zoom canvas: a real button at its place, pressed to choose it and dragged to move it.
 * Used by the idea board's cards and the state machine's states.
 */
export function CanvasCardButton({
  x,
  y,
  width,
  height,
  z,
  label,
  pressed,
  connecting,
  dragging,
  onPointerDown,
  onPress,
  onKeyDown,
  testId,
  data,
  children,
}: {
  x: number
  y: number
  width: number
  height: number
  z?: number
  label: string
  pressed: boolean
  connecting: boolean
  dragging: boolean
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPress: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  testId: string
  data: Record<`data-${string}`, string | boolean | undefined>
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="boardcard"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: z,
      }}
      aria-label={label}
      aria-pressed={pressed}
      data-connecting-from={connecting || undefined}
      data-dragging={dragging || undefined}
      data-testid={testId}
      {...data}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        // A pointer press is handled on release; the keyboard's Enter and Space land here.
        if (event.detail === 0) onPress()
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  )
}
