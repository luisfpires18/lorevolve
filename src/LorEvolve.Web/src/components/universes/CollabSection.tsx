import type { ReactNode } from 'react'
import { Section } from '../Section'
import { QuietNote } from '../QuietNote'

/** One titled list of the Collaborators panel (people, or pending invitations), or its quiet line when it is empty. */
export function CollabSection({
  title,
  titleId,
  isEmpty,
  emptyText,
  emptyTestId,
  listTestId,
  children,
}: {
  title: string
  titleId: string
  isEmpty: boolean
  emptyText: string
  emptyTestId: string
  listTestId: string
  /** The rows. */
  children: ReactNode
}) {
  return (
    <Section title={title} className="collab__section" titleId={titleId}>
      {isEmpty ? (
        <QuietNote spacing="block" testId={emptyTestId}>
          {emptyText}
        </QuietNote>
      ) : (
        <ul className="collab__list" data-testid={listTestId}>
          {children}
        </ul>
      )}
    </Section>
  )
}
