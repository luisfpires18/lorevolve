import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface ManuscriptPart {
  id: string
  title: string
  to: string
  /** How far below its group's top the part sits, for an indent. */
  depth?: number
  /** A short mark after the title, such as whether the part has text yet. */
  mark?: ReactNode
}

export interface ManuscriptPartGroup {
  key: string
  label?: ReactNode
  parts: readonly ManuscriptPart[]
}

/**
 * The Manuscript layout (#377): a list of parts beside the writing column. A story's Manuscript lists its scenes, a
 * project's Script lists its structure's nodes; both render their own editor as `children`.
 *
 * Choosing a part changes the address, so a reload or a bookmark keeps it open. On a narrow screen the list folds into a
 * disclosure that names the open part, so the writing gets the width.
 */
export function ManuscriptParts({
  groups,
  currentId,
  heading,
  outlineLabel,
  toggleLabel,
  closeLabel,
  chooseLabel,
  noneLabel,
  children,
}: {
  groups: readonly ManuscriptPartGroup[]
  currentId: string | null
  heading: string
  outlineLabel: string
  toggleLabel: string
  closeLabel: string
  chooseLabel: string
  /** Said inside a group that has no parts. */
  noneLabel: string
  children: ReactNode
}) {
  const listId = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  // Opened "at" a part rather than simply open: arriving at another part closes the list without an effect chasing the
  // address.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = currentId !== null && openAt === currentId
  const selected = groups.flatMap((group) => group.parts).find((part) => part.id === currentId)

  /**
   * On a narrow screen the list folds away once a part is chosen, taking the link that held the focus with it, so the
   * focus goes to the toggle - which now names the chosen part - rather than to nowhere. On a wide screen the toggle is
   * not shown and the focus stays on the link.
   */
  function chose() {
    setOpenAt(null)
    const button = toggle.current
    if (button && button.offsetParent !== null) button.focus()
  }

  return (
    <section className="manuscript" aria-labelledby={`${listId}-heading`} data-testid="manuscript">
      <h2 className="visually-hidden" id={`${listId}-heading`}>
        {heading}
      </h2>

      <div className="manuscript__layout">
        <nav className="msoutline" aria-label={outlineLabel} data-testid="manuscript-outline">
          <button
            ref={toggle}
            className="msoutline__toggle"
            type="button"
            aria-expanded={isOpen}
            aria-controls={listId}
            onClick={() => setOpenAt(isOpen ? null : currentId)}
            data-testid="manuscript-outline-toggle"
          >
            <span className="msoutline__togglelabel">{isOpen ? closeLabel : toggleLabel}</span>
            {/* Its own direction, not a <bdi>: the title is cut with an ellipsis, and the clipping
                element's direction is what puts the cut at the end of a right-to-left title. */}
            <span className="msoutline__current" dir="auto">
              {selected?.title ?? chooseLabel}
            </span>
          </button>

          <div
            className="msoutline__body"
            id={listId}
            data-open={isOpen ? 'true' : 'false'}
            data-testid="manuscript-outline-list"
          >
            {groups.map((group) => {
              const headingId = `${listId}-${group.key}`
              return (
                <div
                  className="msoutline__group"
                  key={group.key}
                  data-testid="manuscript-outline-group"
                >
                  {group.label ? (
                    <p
                      className="msoutline__heading"
                      id={headingId}
                      data-testid="manuscript-outline-heading"
                    >
                      {group.label}
                    </p>
                  ) : null}
                  {group.parts.length === 0 ? (
                    <p className="msoutline__none">{noneLabel}</p>
                  ) : (
                    <ol
                      className="msoutline__scenes"
                      aria-labelledby={group.label ? headingId : undefined}
                    >
                      {group.parts.map((part) => (
                        <li key={part.id}>
                          {/* A Link with its own aria-current, not a NavLink: a part named by a query (`?node=`) would
                              never match a NavLink's path. */}
                          <Link
                            to={part.to}
                            className="msoutline__link"
                            aria-current={part.id === currentId ? 'page' : undefined}
                            style={
                              part.depth ? ({ '--depth': part.depth } as CSSProperties) : undefined
                            }
                            onClick={chose}
                            data-testid="manuscript-outline-scene"
                            data-title={part.title}
                          >
                            <bdi>{part.title}</bdi>
                            {part.mark}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        </nav>

        <div className="manuscript__main">{children}</div>
      </div>
    </section>
  )
}
