import type { ReactNode } from 'react'

type DataAttributes = { [key: `data-${string}`]: string | undefined }

/**
 * One fact of a FactList: its name and its value, a `dt` and a `dd` in one row. `testId` names the row, `valueTestId`
 * the value, and `valueClassName` adds to the value (`prose` for an author's text). Any `data-*` passes through to the
 * row. Catalogue: docs/design/ui-components.md.
 */
export function Fact({
  name,
  children,
  className,
  valueClassName,
  testId,
  valueTestId,
  ...data
}: {
  name: ReactNode
  children?: ReactNode
  className?: string
  valueClassName?: string
  testId?: string
  valueTestId?: string
} & DataAttributes) {
  return (
    <div
      className={['facts__row', className].filter(Boolean).join(' ')}
      data-testid={testId}
      {...data}
    >
      <dt className="facts__key">{name}</dt>
      <dd
        className={['facts__value', valueClassName].filter(Boolean).join(' ')}
        data-testid={valueTestId}
      >
        {children}
      </dd>
    </div>
  )
}
