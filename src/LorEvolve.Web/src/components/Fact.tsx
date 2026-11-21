import type { ReactNode, Ref } from 'react'

type DataAttributes = { [key: `data-${string}`]: string | undefined }

/**
 * One fact of a FactList: its name and its value, a `dt` and a `dd` in one row. `testId` names the row, `valueTestId`
 * the value, and `valueClassName` adds to the value (`prose` for an author's text). Any `data-*` passes through to the
 * row, and `ref` is the row, for a fold that lives in it (a scene's beats). Catalogue: docs/design/ui-components.md.
 */
export function Fact({
  name,
  children,
  valueClassName,
  testId,
  valueTestId,
  ref,
  ...data
}: {
  name: ReactNode
  children?: ReactNode
  valueClassName?: string
  testId?: string
  valueTestId?: string
  ref?: Ref<HTMLDivElement>
} & DataAttributes) {
  return (
    <div ref={ref} className="facts__row" data-testid={testId} {...data}>
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
