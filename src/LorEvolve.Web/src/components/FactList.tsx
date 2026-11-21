import type { HTMLAttributes, ReactNode } from 'react'

/**
 * A list of facts, each a Fact. `default` is the infobox on sunken paper (an entry's rail, a preview, an era, a
 * project entity, an account in admin); `ruled` is a row per fact between hairlines, name left and value right (a
 * profile); `grid` puts the names in a column beside the values and stacks them on a phone (a backup to restore);
 * `labelled` gives the names an 8rem column (a publish confirm); `inline` runs each name and value on one small line
 * (an era's forms and abilities, an appearance). Any other `dl` attribute passes through: a folded list of a scene's
 * beats takes its fold's `id`, `hidden` and `data-fold`. Catalogue: docs/design/ui-components.md.
 */
export function FactList({
  look = 'default',
  className,
  testId,
  children,
  ...dl
}: Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
  [key: `data-${string}`]: string | undefined
  look?: 'default' | 'ruled' | 'grid' | 'labelled' | 'inline'
  className?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <dl
      className={['facts', look === 'default' ? null : `facts--${look}`, className]
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
      {...dl}
    >
      {children}
    </dl>
  )
}
