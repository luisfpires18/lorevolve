import type { ReactNode } from 'react'

/**
 * The head of a screen: an optional crumb, the screen's one `h1`, a short lede, the screen's
 * actions at the far end, and a slot under it for local navigation or a toolbar.
 *
 * Structure and type only. It knows nothing about what a screen does: the actions are whatever
 * links and buttons the screen passes, and no slot is required. On a phone the actions drop under
 * the title instead of squeezing it.
 */
export function PageHeader({
  title,
  titleId,
  titleTestId,
  titleClassName,
  crumb,
  lede,
  actions,
  children,
}: {
  title: ReactNode
  /** For a section that names itself by its heading (`aria-labelledby`). */
  titleId?: string
  titleTestId?: string
  /** An extra class on the h1 - `titlerule`, on a document's front page. */
  titleClassName?: string
  crumb?: ReactNode
  /** One or two lines of what this screen is. Prose the author wrote belongs elsewhere. */
  lede?: ReactNode
  actions?: ReactNode
  /** Local navigation or a toolbar, directly under the title. */
  children?: ReactNode
}) {
  return (
    <header className="pageheader">
      {crumb ? <div className="pageheader__crumb">{crumb}</div> : null}
      <div className="pageheader__main">
        <div className="pageheader__text">
          <h1
            className={titleClassName ? `pageheader__title ${titleClassName}` : 'pageheader__title'}
            id={titleId}
            data-testid={titleTestId}
          >
            {title}
          </h1>
          {lede ? <div className="pageheader__lede">{lede}</div> : null}
        </div>
        {actions ? <div className="pageheader__actions">{actions}</div> : null}
      </div>
      {children ? <div className="pageheader__slot">{children}</div> : null}
    </header>
  )
}
