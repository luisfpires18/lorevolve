import type { ReactNode } from 'react'
import { QuietNote } from '../QuietNote'

/**
 * The head of a writing surface (a scene's manuscript, a project's script part): where it is told, its title, and
 * the optional tools beside the title and context under it.
 */
export function ManuscriptHead({
  where,
  titleId,
  title,
  whereTestId,
  titleTestId,
  tools,
  context,
}: {
  where: { container?: ReactNode; position: string }
  titleId: string
  title: string
  whereTestId: string
  titleTestId: string
  tools?: ReactNode
  context?: ReactNode
}) {
  return (
    <header className="manuscript__head">
      <QuietNote className="manuscript__where" size="xs" wrap testId={whereTestId}>
        {where.container ? <>{where.container} · </> : null}
        <span className="manuscript__position">{where.position}</span>
      </QuietNote>

      <div className="manuscript__titlerow">
        <h3 className="manuscript__title" id={titleId} data-testid={titleTestId}>
          <bdi>{title}</bdi>
        </h3>

        {tools}
      </div>

      {context}
    </header>
  )
}
