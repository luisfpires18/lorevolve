import type { ReactNode } from 'react'
import type { ButtonSize } from '../lib/buttonClass'
import { Button } from './Button'

interface ConflictBarProps {
  /** What changed elsewhere. */
  text: ReactNode
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
}

/**
 * The banner a save refused as stale shows: keep mine, or load the saved version. A review field by field is
 * `EditConflict`. Catalogue: `docs/design/ui-components.md`.
 */
export function ConflictBar({
  text,
  onKeepMine,
  keepLabel,
  onLoadSaved,
  loadLabel,
  busy,
  size,
  testId,
}: ConflictBarProps) {
  return (
    <div className="conflictbar" role="alert" data-testid={`${testId}-conflict`}>
      <p className="conflictbar__text">{text}</p>
      <div className="conflictbar__actions">
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
          data-testid={`${testId}-load-saved`}
        >
          {loadLabel}
        </Button>
      </div>
    </div>
  )
}
