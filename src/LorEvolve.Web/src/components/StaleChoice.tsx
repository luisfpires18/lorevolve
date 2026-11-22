import type { ReactNode } from 'react'
import type { ButtonSize } from '../lib/buttonClass'
import { Button } from './Button'
import { Callout } from './Callout'

export interface StaleChoiceProps {
  /** What changed elsewhere, or what is saved now. */
  text: ReactNode
  /** The bold first line. */
  title?: ReactNode
  /** Given: Keep mine saves the draft over the newer version. */
  onKeepMine?: () => void
  keepLabel?: ReactNode
  /** Load saved replaces the draft with the newer version. */
  onLoadSaved: () => void
  loadLabel: ReactNode
  /** A save in flight: both buttons wait. */
  busy?: boolean
  /** `sm` inside a drawer. */
  size?: ButtonSize
  /** Ids: `${testId}-conflict`, `${testId}-keep-mine`, `${testId}-load-saved`. */
  testId: string
  /** A screen whose ids kept their own names: the box and the load button. */
  boxId?: string
  loadId?: string
}

/**
 * The box a save refused as stale shows: what changed or is saved now, then keep mine or load the saved version. A
 * review field by field is `EditConflict`. Catalogue: `docs/design/ui-components.md`.
 */
export function StaleChoice({
  text,
  title,
  onKeepMine,
  keepLabel,
  onLoadSaved,
  loadLabel,
  busy,
  size,
  testId,
  boxId,
  loadId,
}: StaleChoiceProps) {
  return (
    <Callout
      look="callout"
      tone="warning"
      role="alert"
      title={title}
      className="stalechoice"
      testId={boxId ?? `${testId}-conflict`}
      actions={
        <>
          {onKeepMine ? (
            <Button
              tone="secondary"
              size={size}
              disabled={busy}
              onClick={onKeepMine}
              data-testid={`${testId}-keep-mine`}
            >
              {keepLabel}
            </Button>
          ) : null}
          <Button
            tone="secondary"
            size={size}
            disabled={busy}
            onClick={onLoadSaved}
            data-testid={loadId ?? `${testId}-load-saved`}
          >
            {loadLabel}
          </Button>
        </>
      }
    >
      <p className="stalechoice__text">{text}</p>
    </Callout>
  )
}
