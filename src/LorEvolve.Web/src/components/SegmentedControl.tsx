import type { ReactNode } from 'react'

export interface SegmentedOption<T> {
  value: T
  label: ReactNode
  testId?: string
  disabled?: boolean
  /** The hover tip, for example why the option is disabled. */
  title?: string
  /** The canon step (0, 1 or 2) whose glyph the canon look draws. */
  canon?: number
}

/**
 * A choice among two to four values on this screen (`.segmented` in `styles/018-controls.css`):
 * one `aria-pressed` button per value in a named group. Name it with `label`, or spread the
 * `Field` group props. Not a place (`ViewLinks`) and not one on/off toggle. Catalogue:
 * `docs/design/ui-components.md`.
 */
export function SegmentedControl<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
  disabled,
  look = 'plain',
  className,
  testId,
  ...group
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** The group's name, when no `Field` names it. */
  label?: string
  /** Disables every option. */
  disabled?: boolean
  /** `canon` draws the canon steps: the smaller size and the glyph. */
  look?: 'plain' | 'canon'
  className?: string
  testId?: string
  /** The `Field` group props, spread. */
  role?: 'group'
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const classes = ['segmented', look === 'canon' && 'segmented--canon', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={classes}
      role="group"
      aria-label={label}
      aria-labelledby={group['aria-labelledby']}
      aria-describedby={group['aria-describedby']}
      data-testid={testId}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.value}
          data-canon={option.canon}
          disabled={disabled || option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          data-testid={option.testId}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
