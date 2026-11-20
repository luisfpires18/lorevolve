import type { ReactNode } from 'react'
import { QuietNote } from './QuietNote'
import { SectionTitle } from './Section'

/**
 * A boxed card in a project's list (#413): a head with its title, a quiet line and the card's verbs, then what the
 * card holds. `head` replaces the head (a rename form in place); `plain` draws the head with no box around it, as a
 * block inside another card does; `titleTone="rule-accent"` sets the title as SectionTitle's accent rule instead. Presentational only: the caller owns the data and the list around it.
 */
export function ProjectCard({
  title,
  level = 3,
  titleClassName = 'projectcard__title',
  titleTone,
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
  /** The title as a SectionTitle rule (a block's heading inside another card), in place of the class. */
  titleTone?: 'rule-accent'
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
          {titleTone ? (
            <SectionTitle level={level} tone={titleTone}>
              {title}
            </SectionTitle>
          ) : (
            <Title className={titleClassName}>{title}</Title>
          )}
          {meta ? <QuietNote spacing="flush">{meta}</QuietNote> : null}
          {actions ? (
            <div className="actions actions--tight projectcard__actions">{actions}</div>
          ) : null}
        </div>
      )}
      {children}
    </Root>
  )
}
