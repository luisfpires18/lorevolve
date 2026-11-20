import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { Load } from '../lib/useAsyncRead'
import { ReadGate } from './ReadGate'

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
  load: Load<T>
  onRetry: () => void
  children: (value: T, labelId: string) => ReactNode
}) {
  const { t } = useI18n()
  const labelId = useId()

  return (
    <div className="usage__item" aria-busy={load.kind === 'loading'} data-testid={testId}>
      <h3 className="usage__name" id={labelId}>
        {name}
      </h3>

      <ReadGate
        load={load}
        loading={{ text: t('account.usage.checking'), className: 'usage__status' }}
        error={{
          message: t('account.usage.failed'),
          onRetry,
          retryLabel: t('account.usage.retry'),
          testId: `${testId}-error`,
          className: 'usage__error',
        }}
      >
        {(value) => children(value, labelId)}
      </ReadGate>
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
  const { t } = useI18n()
  const percent = Math.min(100, Math.round((used / limit) * 100))
  const tiny = used > 0 && percent === 0
  const shown = tiny ? t('account.usage.underOne') : `${percent}%`

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
