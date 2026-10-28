import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { EntityTile } from './EntityTile'
import { FamilyMemberDetails } from './FamilyMemberDetails'
import { readFamilyTree } from '../familyTree/reading'
import { type FamilyRow, type FamilyTree } from '../familyTree/types'
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
  /** A recorded family link that is not parentage ("uncle of", "married to"), with its words at the line's middle. */
  label?: { text: string; x: number; y: number }
}

/** The rows, top to bottom. The focal entry stands in the middle row with its siblings and cousins beside it. */
const ROWS: { position: FamilyRow; label: string }[] = [
  { position: 'grandparents', label: 'Grandparents' },
  { position: 'parents', label: 'Parents, aunts and uncles' },
  { position: 'siblings', label: 'This entry, siblings and cousins' },
  { position: 'children', label: 'Children, nieces and nephews' },
  { position: 'grandchildren', label: 'Grandchildren' },
]

/** Marks a line as a recorded family link rather than a parent link. */
const CONNECTION = -1

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
  // The focal entry's recorded family who hold no derived position - a spouse, or an uncle recorded as one - drawn at the
  // end of the entry's own row, so every recorded link is on the tree.
  const others = useMemo(() => {
    const placed = new Set(
      Object.values(family.rows)
        .flat()
        .map((member) => member.node.entityId),
    )
    placed.add(tree.focalEntityId)
    const ids = new Set(
      tree.connections
        .filter((connection) => connection.entityId === tree.focalEntityId)
        .map((connection) => connection.relatedEntityId)
        .filter((id) => !placed.has(id)),
    )
    return [...ids]
      .map((id) => family.nodes.get(id))
      .filter((node): node is FamilyTreeNode => !!node)
      .sort((first, second) => first.name.localeCompare(second.name))
  }, [family, tree])
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

    // Recorded family that is not parentage, once per link, read from the side of the member listed first: a low arc
    // between the two portraits, its words at the top of the arc.
    const seen = new Set<string>()
    for (const connection of tree.connections) {
      if (seen.has(connection.relationshipId)) continue
      const from = cards.current.get(connection.entityId)
      const to = cards.current.get(connection.relatedEntityId)
      if (!from || !to || from === to) continue
      seen.add(connection.relationshipId)

      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      const x1 = a.left + a.width / 2 - bounds.left
      const x2 = b.left + b.width / 2 - bounds.left
      const y1 = a.top - bounds.top
      const y2 = b.top - bounds.top
      const lift = Math.max(28, Math.abs(x2 - x1) / 5)
      const top = Math.min(y1, y2) - lift

      drawn.push({
        id: connection.relationshipId,
        d: `M ${x1} ${y1} C ${x1} ${top}, ${x2} ${top}, ${x2} ${y2}`,
        semantic: CONNECTION,
        canonStatus: connection.canonStatus,
        label: {
          text: `${family.nodes.get(connection.entityId)?.name ?? ''} ${connection.label.charAt(0).toLowerCase()}${connection.label.slice(1)} ${family.nodes.get(connection.relatedEntityId)?.name ?? ''}`,
          x: (x1 + x2) / 2,
          y: top + lift * 0.25 - 4,
        },
      })
    }

    setEdges(drawn)
    setSize({ width: root.scrollWidth, height: root.scrollHeight })
  }, [tree, family])

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
              <g key={edge.id}>
                <path
                  className="familytree__line"
                  d={edge.d}
                  data-semantic={edge.semantic}
                  data-canon={edge.canonStatus}
                />
                {edge.label ? (
                  <text
                    className="familytree__linelabel"
                    x={edge.label.x}
                    y={edge.label.y}
                    textAnchor="middle"
                  >
                    {edge.label.text}
                  </text>
                ) : null}
              </g>
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
                  {isFocalRow ? others.map((other) => node(other, false)) : null}
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
        <span className="familytree__key" data-semantic={CONNECTION} aria-hidden="true" />
        <span>Other recorded family</span>
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
