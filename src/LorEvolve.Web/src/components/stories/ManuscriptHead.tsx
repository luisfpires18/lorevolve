import type { ReactNode } from 'react'
import { EntryHead } from '../EntryHead'
import { QuietNote } from '../QuietNote'

/**
 * The head of a writing surface (a scene's manuscript, a project's script part), as a Lore entry's head: where it is
 * told in the crumb's place with the optional tools beside it on that line, its title as the name, and the optional
 * context under it. Every line above the prose is a line of prose gone, so the tools share the place's line.
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
    <EntryHead
      crumb={
        <QuietNote size="xs" spacing="flush" wrap testId={whereTestId}>
          {where.container ? <>{where.container} · </> : null}
          {where.position}
        </QuietNote>
      }
      type={null}
      status={tools}
      level={3}
      nameId={titleId}
      nameTestId={titleTestId}
      name={<bdi>{title}</bdi>}
    >
      {context}
    </EntryHead>
  )
}
