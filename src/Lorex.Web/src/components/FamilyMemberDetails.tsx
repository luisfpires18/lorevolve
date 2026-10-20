import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { EntityTile } from './EntityTile'
import { StatusBadge } from './StatusBadge'
import { useDrawerGuard } from '../lib/drawerGuard'
import { linkSentence, type FamilyReading } from '../familyTree/reading'
import { POSITION_LABELS, type FamilyTree } from '../familyTree/types'
import { CANON_LABELS, CanonStatus } from '../lore/types'

/** Where the tree stops drawing lines and the details become a sheet: the tree's own phone width. */
const SHEET_QUERY = '(max-width: 640px)'

/** The gap between the details and the node they belong to, and the least room kept from the window's edge. */
const GAP = 8
const EDGE = 16

interface Props {
  universeId: string
  tree: FamilyTree
  family: FamilyReading
  entityId: string
  /** The node's details control: the popover is placed against it, and the focus goes back to it on closing. */
  anchor: HTMLElement | null
  onClose: () => void
  onFocus: (entityId: string) => void
}

/**
 * One family member's details, opened from the eye on its node (Issue #37): who they are, where they stand in this
 * family and the parent links that put them there, the family their author recorded that is not parentage, and the way
 * to their entry.
 *
 * Lorex's dialog, not a second overlay system: a modal `<dialog>` routed through `useDrawerGuard`, so Escape and a
 * press outside close it as they close every drawer. On a wide screen it is a small popover held against the node; at
 * the tree's phone width it is a sheet from the bottom of the screen. Either way the page behind is inert while it is
 * open, the focus starts on its heading, and goes back to the eye that opened it.
 *
 * Two kinds of family are kept apart, as the tree keeps them: positions derived from parent links, and links the author
 * wrote that place nobody ("brother of", "married to"). Ordinary relationships are not family and are never here.
 */
export function FamilyMemberDetails({
  universeId,
  tree,
  family,
  entityId,
  anchor,
  onClose,
  onFocus,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const [isSheet] = useState(() => window.matchMedia(SHEET_QUERY).matches)
  const { close, dialogProps } = useDrawerGuard(false, '', onClose)

  // Opened, placed and focused before it is first painted, in that order: it has no size to place until it is open,
  // and its heading cannot take the focus until it is shown.
  //
  // The popover is held against its node: below it when there is room, above it when there is not, and never past the
  // window's edge - placed again as the page scrolls or the window changes size, so it stays with its node. The sheet
  // is placed by CSS alone.
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element || element.open) return
    element.showModal()

    function placeIt() {
      if (!element || isSheet || !anchor) return
      const node = (anchor.closest('.familynode') ?? anchor).getBoundingClientRect()
      const own = element.getBoundingClientRect()
      const width = window.innerWidth
      const height = window.innerHeight

      const below = node.bottom + GAP
      const top =
        below + own.height <= height - EDGE || node.top - GAP - own.height < EDGE
          ? Math.min(below, Math.max(EDGE, height - EDGE - own.height))
          : node.top - GAP - own.height
      const left = Math.min(
        Math.max(EDGE, node.left + node.width / 2 - own.width / 2),
        Math.max(EDGE, width - EDGE - own.width),
      )

      element.style.top = `${Math.round(top)}px`
      element.style.left = `${Math.round(left)}px`
    }

    placeIt()
    heading.current?.focus()
    window.addEventListener('resize', placeIt)
    window.addEventListener('scroll', placeIt, true)

    return () => {
      window.removeEventListener('resize', placeIt)
      window.removeEventListener('scroll', placeIt, true)
      // Under StrictMode the effect runs twice; closing on the first cleanup lets the second open it again.
      if (element.open) element.close()
    }
  }, [isSheet, anchor])

  // Back to the eye that opened it, whichever way it closed - a press, Escape, a press outside.
  useEffect(
    () => () => {
      if (anchor?.isConnected) anchor.focus()
    },
    [anchor],
  )

  const node = family.nodes.get(entityId)
  if (!node) return null

  const isFocal = entityId === tree.focalEntityId
  const member = isFocal
    ? null
    : Object.values(family.rows)
        .flat()
        .find((candidate) => candidate.node.entityId === entityId)
  const parentLinks = tree.links.filter(
    (link) => link.parentEntityId === entityId || link.childEntityId === entityId,
  )
  const authored = tree.connections.filter((connection) => connection.entityId === entityId)
  const entryPath = (id: string) => `/app/universes/${universeId}/lore/${id}`

  return (
    <dialog
      ref={dialog}
      className={isSheet ? 'familydetails familydetails--sheet' : 'familydetails'}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="family-details"
      data-layout={isSheet ? 'sheet' : 'popover'}
    >
      <div className="familydetails__panel">
        <header className="familydetails__head">
          <EntityTile
            universeId={universeId}
            entityId={node.entityId}
            image={node.image}
            typeIcon={node.entityTypeIcon}
            typeAccent={node.entityTypeAccentColor}
            className="familydetails__tile"
          />
          <div className="familydetails__title">
            <h2 className="familydetails__name" id={headingId} ref={heading} tabIndex={-1}>
              <bdi>{node.name}</bdi>
            </h2>
            <p className="familydetails__kind">
              <bdi>{node.entityTypeName}</bdi>
              <StatusBadge step={node.canonStatus} label={CANON_LABELS[node.canonStatus]} />
            </p>
          </div>
          <button
            className="iconbutton familydetails__close"
            type="button"
            onClick={close}
            aria-label="Close"
            title="Close"
            data-testid="family-details-close"
          >
            <X aria-hidden="true" focusable="false" strokeWidth={1.75} />
          </button>
        </header>

        <div className="familydetails__body">
          <section aria-labelledby={`${headingId}-place`}>
            <h3 className="familydetails__heading" id={`${headingId}-place`}>
              In this family
            </h3>
            <ul className="familydetails__list" data-testid="family-details-place">
              {isFocal ? <li>This page shows this entry&rsquo;s family.</li> : null}
              {member?.relations.flatMap((relation) =>
                relation.paths.map((path) => (
                  <li key={`${relation.position}-${path.linkIds.join('-')}`}>
                    <span className="familydetails__position">
                      {POSITION_LABELS[relation.position].one}:
                    </span>{' '}
                    <span dir="auto">{path.text}</span>
                    {path.canonStatus === CanonStatus.Canon ? null : (
                      <span className="familydetails__draft">
                        {' '}
                        ({CANON_LABELS[path.canonStatus]} connection)
                      </span>
                    )}
                  </li>
                )),
              )}
              {parentLinks.map((link) => (
                <li key={link.relationshipId} dir="auto">
                  {linkSentence(link, family.nodes)}
                  {link.canonStatus === CanonStatus.Canon ? null : (
                    <span className="familydetails__draft">
                      {' '}
                      ({CANON_LABELS[link.canonStatus]} connection)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby={`${headingId}-other`}>
            <h3 className="familydetails__heading" id={`${headingId}-other`}>
              Other family
            </h3>
            {authored.length === 0 ? (
              <p className="familydetails__note">None recorded.</p>
            ) : (
              <>
                <ul className="familydetails__list" data-testid="family-details-other">
                  {authored.map((connection) => {
                    const other = family.nodes.get(connection.relatedEntityId)
                    return (
                      <li key={connection.relationshipId} data-testid="family-details-connection">
                        <bdi className="familydetails__label">{connection.label}</bdi>{' '}
                        {other ? (
                          <Link to={entryPath(other.entityId)}>
                            <bdi>{other.name}</bdi>
                          </Link>
                        ) : null}
                        {connection.canonStatus === CanonStatus.Canon ? null : (
                          <span className="familydetails__draft">
                            {' '}
                            ({CANON_LABELS[connection.canonStatus]} connection)
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <p className="familydetails__note">
                  Recorded as you wrote them. These links put nobody in the tree and imply no other
                  relative.
                </p>
              </>
            )}
          </section>
        </div>

        <footer className="familydetails__actions">
          <Link className="button button--secondary" to={entryPath(node.entityId)}>
            Open entry
          </Link>
          {isFocal ? null : (
            <button
              className="button button--text"
              type="button"
              onClick={() => {
                onClose()
                onFocus(node.entityId)
              }}
            >
              Show this family
            </button>
          )}
        </footer>
      </div>
    </dialog>
  )
}
