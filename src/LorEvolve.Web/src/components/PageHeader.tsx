import type { ReactNode } from 'react'

/**
 * The head of a screen: an optional crumb, the screen's one `h1`, a short lede, the screen's
 * actions at the far end, and a slot under it for local navigation or a toolbar.
 *
 * `level={1}` once per screen; a panel inside a screen is `level={2} size="panel"`. `lead` is a small picture before the
 * title. Structure and type only. It knows nothing about what a screen does: the actions are whatever
 * links and buttons the screen passes, and no slot is required. On a phone the actions drop under
 * the title instead of squeezing it. With no `title` the head is its actions alone, at the far end on a desktop and
 * at the start on a phone, as they sit beside a title: a toolbar where a title above already names the screen.
 */
export function PageHeader({
  title,
  titleId,
  titleTestId,
  titleClassName,
  crumb,
  lede,
  actions,
  lead,
  level = 1,
  size = 'page',
  accent = false,
  children,
}: {
  title?: ReactNode
  /** For a section that names itself by its heading (`aria-labelledby`). */
  titleId?: string
  titleTestId?: string
  /** An extra class on the h1 - `titlerule`, on a document's front page. */
  titleClassName?: string
  crumb?: ReactNode
  /** One or two lines of what this screen is. Prose the author wrote belongs elsewhere. */
  lede?: ReactNode
  actions?: ReactNode
  /** A small picture before the title (an avatar). */
  lead?: ReactNode
  /** The heading level: 1 for the screen's own head, 2 for a head inside a screen, 3 for one inside a row of that. */
  level?: 1 | 2 | 3
  /** `panel` draws the title as a panel's name (the section rule) instead of a screen title. */
  size?: 'page' | 'panel'
  /** With `size="panel"`: the smaller accent rule, as SectionTitle's `tone="rule-accent"` (a block's head inside a row). */
  accent?: boolean
  /** Local navigation or a toolbar, directly under the title. */
  children?: ReactNode
}) {
  const Heading = `h${level}` as const
  const base =
    size === 'panel'
      ? accent
        ? 'sectionrule sectionrule--accent'
        : 'sectionrule'
      : 'pageheader__title'
  return (
    <header className={size === 'panel' ? 'pageheader pageheader--panel' : 'pageheader'}>
      {crumb ? <div className="pageheader__crumb">{crumb}</div> : null}
      <div className="pageheader__main">
        {lead}
        {title === undefined ? null : (
          <div className="pageheader__text">
            <Heading
              className={titleClassName ? `${base} ${titleClassName}` : base}
              id={titleId}
              data-testid={titleTestId}
            >
              {title}
            </Heading>
            {lede ? <div className="pageheader__lede">{lede}</div> : null}
          </div>
        )}
        {actions ? (
          <div className="actions actions--tight pageheader__actions">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="pageheader__slot">{children}</div> : null}
    </header>
  )
}
