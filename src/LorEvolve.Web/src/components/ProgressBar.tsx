/**
 * The shared progress bar (`styles/009-progress.css`), or a meter with `meter`. Named by `label` or by the element
 * `labelledBy` points at. With `value` it is determinate and says its numbers; without, it is indeterminate and claims
 * none. `state` picks the look (`working` sweeps, `sending` fills, `full` is the usage meter's danger ink) and `fill` is the width in
 * percent; both are the caller's, so the bar never guesses. The words beside a bar stay with its caller. Catalogue:
 * docs/design/ui-components.md.
 */
export function ProgressBar({
  label,
  labelledBy,
  meter = false,
  value,
  state,
  fill,
  className,
  testId,
}: {
  label?: string
  labelledBy?: string
  meter?: boolean
  value?: { now: number; max: number; text: string }
  state?: 'working' | 'sending' | 'full'
  fill?: number
  className?: string
  testId?: string
}) {
  return (
    <div
      className={className ? `progressbar ${className}` : 'progressbar'}
      role={meter ? 'meter' : 'progressbar'}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={value ? 0 : undefined}
      aria-valuemax={value?.max}
      aria-valuenow={value?.now}
      aria-valuetext={value?.text}
      data-state={state}
      data-testid={testId}
    >
      <span
        className="progressbar__fill"
        style={fill === undefined ? undefined : { width: `${fill}%` }}
      />
    </div>
  )
}
