import { useId, type ReactNode } from 'react'
import type { UsageLoad } from '../lib/useUsageLoad'

/**
 * One allowance in the Usage section: its name, then its numbers once read, or the loading and failed states in its own
 * place. `children` gets the name's id, so the meter is labelled by it.
 */
export function UsageItem<T>({
  name,
  testId,
  load,
  onRetry,
  children,
}: {
  name: string
  testId: string
  load: UsageLoad<T>
  onRetry: () => void
  children: (value: T, labelId: string) => ReactNode
}) {
  const labelId = useId()

  return (
    <div className="usage__item" aria-busy={load.kind === 'loading'} data-testid={testId}>
      <h3 className="usage__name" id={labelId}>
        {name}
      </h3>

      {load.kind === 'loading' ? (
        <p className="usage__status" role="status">
          Checking your usage…
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div
          className="notice notice--error usage__error"
          role="alert"
          data-testid={`${testId}-error`}
        >
          <p>Your usage didn't load.</p>
          <button className="button button--secondary" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}

      {load.kind === 'ready' ? children(load.value, labelId) : null}
    </div>
  )
}

/**
 * The amount in words with its percentage, then the shared progress bar as a meter that says the same to a screen
 * reader. Full is the caller's to say in words; the bar's danger ink only repeats it. Anything used is never drawn as an
 * empty bar, or read as 0%, however small next to the allowance.
 */
export function UsageMeter({
  labelId,
  testId,
  amount,
  used,
  limit,
  full,
}: {
  labelId: string
  testId: string
  amount: string
  used: number
  limit: number
  full: boolean
}) {
  const percent = Math.min(100, Math.round((used / limit) * 100))
  const tiny = used > 0 && percent === 0
  const shown = tiny ? 'Under 1%' : `${percent}%`

  return (
    <>
      <p className="usage__amount">
        <span data-testid={`${testId}-amount`}>{amount}</span>
        <span className="usage__percent" data-testid={`${testId}-percent`}>
          {shown}
        </span>
      </p>

      <div
        className="progressbar usage__meter"
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${amount}, ${shown}`}
        data-state={full ? 'full' : undefined}
        data-testid={`${testId}-meter`}
      >
        <span className="progressbar__fill" style={{ width: `${tiny ? 1 : percent}%` }} />
      </div>
    </>
  )
}
