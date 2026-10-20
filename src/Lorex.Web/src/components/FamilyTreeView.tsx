import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { EntityTile } from './EntityTile'
import { FamilyMemberDetails } from './FamilyMemberDetails'
import { readFamilyTree } from '../familyTree/reading'
import { POSITION_LABELS, type FamilyPosition, type FamilyTree } from '../familyTree/types'
import type { FamilyTreeNode } from '../familyTree/types'
import { FamilySemantic } from '../relationships/types'

interface Props {
  universeId: string
  tree: FamilyTree
  onFocus: (entityId: string) => void
}

/** One drawn line between two members. */
interface Edge {
  id: string
  d: string
  semantic: number
  canonStatus: number
}

/** The rows, top to bottom. The focal entry stands in the middle row with its siblings beside it. */
const ROWS: { position: FamilyPosition; label: string }[] = [
  { position: 'grandparents', label: POSITION_LABELS.grandparents.many },
  { position: 'parents', label: POSITION_LABELS.parents.many },
  { position: 'siblings', label: 'This entry and siblings' },
  { position: 'children', label: POSITION_LABELS.children.many },
  { position: 'grandchildren', label: POSITION_LABELS.grandchildren.many },
]

/**
 * A family, drawn as generations rather than as a graph: grandparents and parents above, the focal entry and
 * its siblings in the middle, children and grandchildren below.
 *
 * Each member is a portrait in a circle with the name beneath (Issue #37). Everything else a member's old card
 * carried - its type, its Canon status, every position it holds and the links that put it there, and the family
 * its author recorded that is not parentage - is one press away on the eye, in `FamilyMemberDetails`. The portrait
 * takes the focus to that member's family, as the card's name did.
 *
 * The lines are decoration - they are measured from the members and drawn in an `aria-hidden` SVG - so the
 * structure a screen reader or a keyboard follows is the row headings, the lists, and the details, where every
 * position and every biological or adoptive link is written out in words.
 */
export function FamilyTreeView({ universeId, tree, onFocus }: Props) {
  const family = useMemo(() => readFamilyTree(tree), [tree])
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const focalCard = useRef<HTMLLIElement>(null)
  const cards = useRef(new Map<string, HTMLLIElement | null>())
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  // Whose details are open, from which eye, in which family: another family's tree closes them.
  const [open, setOpen] = useState<{
    focal: string
    entityId: string
    anchor: HTMLButtonElement
  } | null>(null)
  const shown = open?.focal === tree.focalEntityId ? open : null

  const measure = useCallback(() => {
    const root = canvas.current
    if (!root) return

    const bounds = root.getBoundingClientRect()
    const drawn: Edge[] = []

    for (const link of tree.links) {
      const from = cards.current.get(link.parentEntityId)
      const to = cards.current.get(link.childEntityId)
      if (!from || !to) continue

      const parent = from.getBoundingClientRect()
      const child = to.getBoundingClientRect()

      // Normally a parent sits above its child. When it does not - two positions in one row, or a circle of
      // links - the line leaves and arrives on the other edge instead of cutting through the members.
      const downwards = child.top >= parent.bottom
      const x1 = parent.left + parent.width / 2 - bounds.left
      const x2 = child.left + child.width / 2 - bounds.left
      const y1 = (downwards ? parent.bottom : parent.top) - bounds.top
      const y2 = (downwards ? child.top : child.bottom) - bounds.top
      const bend = Math.max(18, Math.abs(y2 - y1) / 2) * (downwards ? 1 : -1)

      drawn.push({
        id: link.relationshipId,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        semantic: link.semantic,
        canonStatus: link.canonStatus,
      })
    }

    setEdges(drawn)
    setSize({ width: root.scrollWidth, height: root.scrollHeight })
  }, [tree])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const root = canvas.current
    if (!root || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => measure())
    observer.observe(root)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // A wide family scrolls sideways inside its own box; the entry being looked at starts in view. Only that box
  // moves - scrolling the member into view would move the page under the reader as well.
  useEffect(() => {
    const box = scroller.current
    const card = focalCard.current
    if (!box || !card || box.scrollWidth <= box.clientWidth) return
    const offset = card.getBoundingClientRect().left - box.getBoundingClientRect().left
    box.scrollLeft += offset - (box.clientWidth - card.offsetWidth) / 2
  }, [tree.focalEntityId])

  const focal = family.focal

  function node(member: FamilyTreeNode, isFocal: boolean) {
    const portrait = (
      <EntityTile
        universeId={universeId}
        entityId={member.entityId}
        image={member.image}
        typeIcon={member.entityTypeIcon}
        typeAccent={member.entityTypeAccentColor}
        className="familynode__tile"
      />
    )

    return (
      <li
        key={member.entityId}
        className={isFocal ? 'familynode familynode--focal' : 'familynode'}
        ref={(element) => {
          if (isFocal) focalCard.current = element
          register(member.entityId, element)
        }}
        data-testid={`family-node-${member.name}`}
        data-focal={isFocal ? 'true' : undefined}
        data-canon={member.canonStatus}
        aria-current={isFocal ? 'true' : undefined}
      >
        {isFocal ? (
          <div className="familynode__face">{portrait}</div>
        ) : (
          <button
            className="familynode__face familynode__button"
            type="button"
            onClick={() => onFocus(member.entityId)}
            data-testid={`family-focus-${member.name}`}
          >
            {portrait}
            <span className="visually-hidden">Show the family of {member.name}</span>
          </button>
        )}
        <button
          className="familynode__eye"
          type="button"
          onClick={(event) =>
            setOpen({
              focal: tree.focalEntityId,
              entityId: member.entityId,
              anchor: event.currentTarget,
            })
          }
          aria-haspopup="dialog"
          aria-expanded={shown?.entityId === member.entityId}
          aria-label={`Details for ${member.name}`}
          title={`Details for ${member.name}`}
          data-testid={`family-details-${member.name}`}
        >
          <Eye aria-hidden="true" focusable="false" strokeWidth={1.75} />
        </button>
        <p className="familynode__name" title={member.name}>
          <bdi>{member.name}</bdi>
          {isFocal ? <span className="visually-hidden"> (family shown for this entry)</span> : null}
        </p>
      </li>
    )
  }

  return (
    <div className="familytree" data-testid="family-tree">
      <div className="familytree__scroll" ref={scroller}>
        <div className="familytree__canvas" ref={canvas}>
          <svg
            className="familytree__lines"
            aria-hidden="true"
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          >
            {edges.map((edge) => (
              <path
                key={edge.id}
                className="familytree__line"
                d={edge.d}
                data-semantic={edge.semantic}
                data-canon={edge.canonStatus}
              />
            ))}
          </svg>

          {ROWS.map((row) => {
            const members = family.rows[row.position]
            const isFocalRow = row.position === 'siblings'
            if (members.length === 0 && !isFocalRow) return null

            // Siblings stand on both sides of the entry being looked at, so it stays in the middle.
            const half = Math.ceil(members.length / 2)
            const before = isFocalRow ? members.slice(0, half) : members
            const after = isFocalRow ? members.slice(half) : []

            return (
              <section
                className="familytree__row"
                key={row.position}
                aria-label={row.label}
                data-row={row.position}
              >
                <h2 className="familytree__rowlabel">{row.label}</h2>
                <ul className="familytree__members">
                  {before.map((member) => node(member.node, false))}
                  {isFocalRow && focal ? node(focal, true) : null}
                  {after.map((member) => node(member.node, false))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>

      <p className="familytree__legend" data-testid="family-legend">
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.BiologicalParent}
          aria-hidden="true"
        />
        <span>Biological</span>
        <span
          className="familytree__key"
          data-semantic={FamilySemantic.AdoptiveParent}
          aria-hidden="true"
        />
        <span>Adoptive</span>
        <span className="familytree__legendnote">
          Faded lines and dashed rings mark what is not Canon yet. Open the eye beside a portrait to
          see that person&rsquo;s details, with every connection written out.
        </span>
      </p>

      {shown ? (
        <FamilyMemberDetails
          key={shown.entityId}
          universeId={universeId}
          tree={tree}
          family={family}
          entityId={shown.entityId}
          anchor={shown.anchor}
          onClose={() => setOpen(null)}
          onFocus={onFocus}
        />
      ) : null}
    </div>
  )

  function register(entityId: string, element: HTMLLIElement | null) {
    if (element) cards.current.set(entityId, element)
    else cards.current.delete(entityId)
  }
}
