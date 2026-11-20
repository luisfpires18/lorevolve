import type { ReactNode } from 'react'
import { QuietNote } from '../QuietNote'

export type NameListItem = { id: string; name: string; aside?: ReactNode; testId?: string }

/**
 * A named list of what a publish would make public or skip: a heading line (`label` in bold, then `note`), and every
 * name in a box that scrolls when the list is long, with its `aside` after a dot. The list is focusable so it scrolls
 * from the keyboard as well, and named by the heading `id`. `children` follow the list (a "more" line, a note).
 * Catalogue: docs/design/ui-components.md.
 */
export function NameListBlock({
  id,
  label,
  note,
  items,
  testId,
  children,
}: {
  id: string
  label: ReactNode
  note?: ReactNode
  items: NameListItem[]
  testId?: string
  children?: ReactNode
}) {
  return (
    <div className="publication__selected" data-testid={testId}>
      <QuietNote spacing="block" id={id}>
        <strong>{label}</strong>
        {note ? <> {note}</> : null}
      </QuietNote>
      <ul className="publication__selectedlist" aria-labelledby={id} tabIndex={0}>
        {items.map((item) => (
          <li key={item.id} data-testid={item.testId}>
            <bdi>{item.name}</bdi>
            {item.aside ? (
              <>
                {' '}
                <span className="publication__selectedtype">· {item.aside}</span>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}
