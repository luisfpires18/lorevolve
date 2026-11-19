import type { ReactNode } from 'react'
import { Crumb } from './Crumb'
import { QuietNote } from './QuietNote'

/**
 * The head of a document editor or reader: the way back, the title with its actions menu, and the lede.
 * The lede is a `QuietNote`. `children` sit under it (a note about where the document belongs). Catalogue: `docs/design/ui-components.md`.
 */
export function DocumentHead({
  back,
  title,
  titleId,
  titleTestId,
  actions,
  lede,
  children,
}: {
  back: { to: string; label: ReactNode; testId?: string }
  title: ReactNode
  /** For the editor that names itself by this heading (`aria-labelledby`). */
  titleId?: string
  titleTestId?: string
  actions?: ReactNode
  lede?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="dochead">
      <Crumb back items={[back]} className="dochead__back" />
      <div className="dochead__row">
        <h1 className="dochead__title" id={titleId} data-testid={titleTestId}>
          {title}
        </h1>
        {actions}
      </div>
      {lede ? <QuietNote className="dochead__lede">{lede}</QuietNote> : null}
      {children}
    </header>
  )
}
