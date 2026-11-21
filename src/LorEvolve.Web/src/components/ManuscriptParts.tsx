import { useId, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery'
import { DisclosureButton } from './DisclosureButton'
import { QuietNote } from './QuietNote'
import { ViewLinks } from './ViewLinks'

export interface ManuscriptPart {
  id: string
  title: string
  to: string
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
  // Where the entry layout folds into one column, the outline is a disclosure under the writing.
  const narrow = useMediaQuery('(max-width: 1100px)')
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
    <section
      className="manuscript entry__layout"
      aria-labelledby={`${listId}-heading`}
      data-testid="manuscript"
    >
      <h2 className="visually-hidden" id={`${listId}-heading`}>
        {heading}
      </h2>

      <div className="entry__main">{children}</div>

      <nav className="entry__rail" aria-label={outlineLabel} data-testid="manuscript-outline">
        {narrow ? (
          <DisclosureButton
            ref={toggle}
            tone="text"
            expanded={isOpen}
            controls={listId}
            onToggle={() => setOpenAt(isOpen ? null : currentId)}
            data-testid="manuscript-outline-toggle"
          >
            {isOpen ? closeLabel : toggleLabel} <bdi>{selected?.title ?? chooseLabel}</bdi>
          </DisclosureButton>
        ) : null}

        <div id={listId} hidden={narrow && !isOpen} data-testid="manuscript-outline-list">
          {groups.map((group) => {
            const headingId = `${listId}-${group.key}`
            return (
              <div key={group.key} data-testid="manuscript-outline-group">
                {group.label ? (
                  <QuietNote size="xs" id={headingId} testId="manuscript-outline-heading">
                    {group.label}
                  </QuietNote>
                ) : null}
                {group.parts.length === 0 ? (
                  <QuietNote spacing="flush">{noneLabel}</QuietNote>
                ) : (
                  // Links with their own aria-current, not NavLinks: a part named by a query (`?node=`) would never
                  // match a NavLink's path.
                  <ViewLinks
                    label={outlineLabel}
                    labelledBy={group.label ? headingId : undefined}
                    items={group.parts.map((part) => ({
                      to: part.to,
                      current: part.id === currentId,
                      title: part.title,
                      onClick: chose,
                      testId: 'manuscript-outline-scene',
                      label: (
                        <>
                          <bdi>{part.title}</bdi>
                          {part.mark}
                        </>
                      ),
                    }))}
                  />
                )}
              </div>
            )
          })}
        </div>
      </nav>
    </section>
  )
}
