import type { ReactNode } from 'react'

/**
 * A boxed card in a project's list (#413): a head with its title, a quiet line and the card's verbs, then what the
 * card holds. `head` replaces the head (a rename form in place); `plain` draws the head with no box around it, as a
 * block inside another card does. Presentational only: the caller owns the data and the list around it.
 */
export function ProjectCard({
  title,
  level = 3,
  titleClassName = 'projectcard__title',
  meta,
  actions,
  head,
  plain = false,
  as: Root = 'li',
  testId,
  children,
}: {
  title: ReactNode
  level?: 3 | 4
  /** The title's class, replacing the card's own. */
  titleClassName?: string
  meta?: ReactNode
  actions?: ReactNode
  /** Drawn instead of the head. */
  head?: ReactNode
  plain?: boolean
  as?: 'li' | 'section'
  testId: string
  children?: ReactNode
}) {
  const Title = `h${level}` as const
  return (
    <Root className={plain ? undefined : 'projectcard'} data-testid={testId}>
      {head ?? (
        <div className="projectcard__head">
          <Title className={titleClassName}>{title}</Title>
          {meta ? <p className="projectcard__meta">{meta}</p> : null}
          {actions ? <div className="projectcard__actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </Root>
  )
}
