import type { HTMLAttributes, ReactNode } from 'react'

/** The narrowest a card may get before the grid drops a column, in rem. */
export type CardGridMin = 13 | 14 | 15 | 16 | 16.5 | 17

/**
 * The one list of cards: as many columns as the width allows, each at least `min` wide, `gap` apart; `rows` sets one
 * card per line. A caller keeps a class of its own only for rules that are not width and gap. Not for form fields.
 */
export function CardGrid({
  min = 16.5,
  gap = 4,
  rows = false,
  testId,
  className,
  children,
  ...list
}: Omit<HTMLAttributes<HTMLUListElement>, 'className' | 'children'> & {
  min?: CardGridMin
  gap?: 3 | 4 | 5
  rows?: boolean
  testId?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <ul
      {...list}
      className={[
        'cardgrid',
        rows ? 'cardgrid--rows' : min === 16.5 ? null : `cardgrid--min-${min}`,
        gap === 4 ? null : `cardgrid--gap-${gap}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    >
      {children}
    </ul>
  )
}
