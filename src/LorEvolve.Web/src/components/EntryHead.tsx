import type { ReactNode } from 'react'

/**
 * The head of an entry page, Lore's or a project's: the crumb, the entry's type and status on one line, the name with the
 * gold rule, then the summary. While the name is a field (`nameField`) the screen still has its one `h1`, visually hidden
 * (`hiddenHeading`). The crumb is a `Crumb`; the type, status, field and `children` are the caller's.
 */
export function EntryHead({
  crumb,
  type,
  status,
  name,
  nameTestId,
  nameField,
  hiddenHeading,
  children,
}: {
  crumb: ReactNode
  type: ReactNode
  status?: ReactNode
  name?: ReactNode
  nameTestId?: string
  /** The name as an input: draws the hidden `h1` and the field instead of the visible name. */
  nameField?: ReactNode
  hiddenHeading?: ReactNode
  /** Aliases, summary and field errors, under the name. */
  children?: ReactNode
}) {
  return (
    <header className="entry__head">
      <div className="entry__kind">
        {crumb}
        {type}
        {status}
      </div>
      {nameField ? (
        <>
          <h1 className="visually-hidden">{hiddenHeading}</h1>
          {nameField}
        </>
      ) : (
        <h1 className="entry__name titlerule" data-testid={nameTestId}>
          {name}
        </h1>
      )}
      {children}
    </header>
  )
}
