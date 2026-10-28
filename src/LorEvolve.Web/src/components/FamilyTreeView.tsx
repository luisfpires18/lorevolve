import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { EntityTile } from './EntityTile'
import { FamilyMemberDetails } from './FamilyMemberDetails'
import { arrangeFamily } from '../familyTree/layout'
import { readFamilyTree } from '../familyTree/reading'
import { type FamilyRow, type FamilyTree } from '../familyTree/types'
import type { FamilyTreeConnection, FamilyTreeNode } from '../familyTree/types'
import { CanonStatus, type CanonStatusValue } from '../lore/types'
import { FamilySemantic } from '../relationships/types'

interface Props {
  universeId: string
  tree: FamilyTree
  onFocus: (entityId: string) => void
}

/**
 * One drawn line. `stem` drops from a parent, or from between two co-parents, to the bar its children hang from; `drop`
 * falls from that bar to one child; `couple` joins two members side by side; `curve` is a parent link the generations
 * cannot draw straight (two positions in one row, a circle of links); `other` is recorded family, drawn only while one
 * of its members is pointed at or focused.
 */
interface Edge {
  id: string
  d: string
  part: 'stem' | 'drop' | 'couple' | 'curve' | 'other'
  semantic: number
  canonStatus: number
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
 * Couples stand side by side, joined by a short line, and their children hang from one stem between them, so siblings
 * are read from the bar they share rather than from lines of their own (`arrangeFamily`). Recorded family that joins no
 * couple - a guardian, a betrothal, a sibling link between siblings - has no permanent line: pointing at or focusing a
 * member draws theirs, and the caption beneath writes them out. No line carries words.
 *
 * The lines are decoration - they are measured from the members and drawn in an `aria-hidden` SVG - so the
 * structure a screen reader or a keyboard follows is the row headings, the lists, the caption and the details, where
 * every position and every link is written out in words.
 */
export function FamilyTreeView({ universeId, tree, onFocus }: Props) {
  const family = useMemo(() => readFamilyTree(tree), [tree])
  // The focal entry's recorded family who hold no derived position - a spouse, or an uncle recorded as one - drawn
  // beside it in its own row, so every recorded link of the entry in focus is on the tree.
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
  const layout = useMemo(
    () =>
      arrangeFamily({
        rows: Object.fromEntries(
          ROWS.map((row) => [
            row.position,
            family.rows[row.position].map((member) => member.node.entityId),
          ]),
        ) as Record<FamilyRow, string[]>,
        focalId: tree.focalEntityId,
        others: family.focal ? others.map((other) => other.entityId) : [],
        links: tree.links,
        connections: tree.connections,
      }),
    [family, others, tree],
  )
  const scroller = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const focalCard = useRef<HTMLLIElement>(null)
  const cards = useRef(new Map<string, HTMLLIElement | null>())
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  // The member pointed at, and the one holding the focus: whose recorded family is drawn and written out while they
  // are. Kept apart, so a pointer leaving never takes away what the keyboard is on.
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  // Whose details are open, from which eye, in which family: another family's tree closes them.
  const [open, setOpen] = useState<{
    focal: string
    entityId: string
    anchor: HTMLButtonElement
  } | null>(null)
  const shown = open?.focal === tree.focalEntityId ? open : null
  const pointed = [hovered, focused].find((id) => !!id && family.nodes.has(id)) ?? null

  const measure = useCallback(() => {
    const root = canvas.current
    if (!root) return

    const bounds = root.getBoundingClientRect()
    const box = (entityId: string) => cards.current.get(entityId)?.getBoundingClientRect()
    const face = (entityId: string) =>
      cards.current.get(entityId)?.querySelector('.familynode__face')?.getBoundingClientRect()
    const x = (rect: DOMRect) => rect.left + rect.width / 2 - bounds.left
    const drawn: Edge[] = []

    // Couples first, so a stem from between two co-parents starts on the line that joins them.
    const coupled = new Set<string>()
    for (const couple of layout.couples) {
      const left = face(couple.left)
      const right = face(couple.right)
      if (!left || !right) continue
      coupled.add([couple.left, couple.right].sort().join('|'))
      const y = left.top + left.height / 2 - bounds.top
      drawn.push({
        id: `couple-${couple.left}-${couple.right}`,
        d: `M ${left.right - bounds.left} ${y} H ${right.left - bounds.left}`,
        part: 'couple',
        semantic: couple.parents ? FamilySemantic.BiologicalParent : CONNECTION,
        canonStatus: leastSettled(
          tree.connections
            .filter((connection) => couple.relationshipIds.includes(connection.relationshipId))
            .map((connection) => connection.canonStatus),
        ),
      })
    }

    // Each child under the parents drawn above it, grouped by those parents: one stem, one bar, one drop per child.
    const groups = new Map<string, { parents: string[]; children: string[] }>()
    const above = new Map<string, string[]>()
    for (const link of tree.links) {
      const parent = box(link.parentEntityId)
      const child = box(link.childEntityId)
      if (!parent || !child) continue
      if (child.top >= parent.bottom) {
        above.set(link.childEntityId, [
          ...(above.get(link.childEntityId) ?? []),
          link.parentEntityId,
        ])
        continue
      }

      // Normally a parent sits above its child. When it does not - two positions in one row, or a circle of
      // links - the line leaves and arrives on the other edge instead of cutting through the members.
      const x1 = x(parent)
      const x2 = x(child)
      const y1 = parent.top - bounds.top
      const y2 = child.bottom - bounds.top
      const bend = -Math.max(18, Math.abs(y2 - y1) / 2)
      drawn.push({
        id: link.relationshipId,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        part: 'curve',
        semantic: link.semantic,
        canonStatus: link.canonStatus,
      })
    }
    for (const [child, parents] of above) {
      const sorted = [...new Set(parents)].sort()
      const key = sorted.join('|')
      const group = groups.get(key) ?? { parents: sorted, children: [] }
      group.children.push(child)
      groups.set(key, group)
    }

    // Bars sharing the gap between two generations are spread a little, so two families never read as one.
    const gaps = new Map<number, number>()
    const placed = [...groups.values()].map((group) => {
      const rects = group.parents.map((id) => box(id)!)
      const bottom = Math.max(...rects.map((rect) => rect.bottom)) - bounds.top
      const top = Math.min(...group.children.map((id) => box(id)!.top)) - bounds.top
      const slot = gaps.get(Math.round(bottom)) ?? 0
      gaps.set(Math.round(bottom), slot + 1)
      return { group, rects, bottom, top, slot }
    })
    for (const { group, rects, bottom, top, slot } of placed) {
      const spread = Math.ceil(slot / 2) * (slot % 2 === 0 ? 1 : -1) * 8
      const bar = Math.min(top - 8, Math.max(bottom + 8, (bottom + top) / 2 + spread))
      const pairJoined = group.parents.length === 2 && coupled.has(group.parents.join('|'))
      // From between a joined couple, starting on their line; otherwise from under each parent's name.
      const starts = pairJoined
        ? [
            {
              x: (x(rects[0]) + x(rects[1])) / 2,
              y: face(group.parents[0])!.top + face(group.parents[0])!.height / 2 - bounds.top,
            },
          ]
        : rects.map((rect) => ({ x: x(rect), y: rect.bottom - bounds.top }))
      const ends = group.children.map((id) => x(box(id)!))
      const xs = [...starts.map((start) => start.x), ...ends]
      const links = tree.links.filter(
        (link) =>
          group.parents.includes(link.parentEntityId) &&
          group.children.includes(link.childEntityId),
      )

      drawn.push({
        id: `stem-${group.parents.join('-')}`,
        d: [
          ...starts.map((start) => `M ${start.x} ${start.y} V ${bar}`),
          `M ${Math.min(...xs)} ${bar} H ${Math.max(...xs)}`,
        ].join(' '),
        part: 'stem',
        semantic: FamilySemantic.BiologicalParent,
        canonStatus: leastSettled(links.map((link) => link.canonStatus)),
      })
      for (const child of group.children) {
        const own = links.filter((link) => link.childEntityId === child)
        drawn.push({
          id: `drop-${group.parents.join('-')}-${child}`,
          d: `M ${x(box(child)!)} ${bar} V ${box(child)!.top - bounds.top}`,
          part: 'drop',
          // Adoptive only when every parent above holds the child that way.
          semantic: own.every((link) => link.semantic === FamilySemantic.AdoptiveParent)
            ? FamilySemantic.AdoptiveParent
            : FamilySemantic.BiologicalParent,
          canonStatus: leastSettled(own.map((link) => link.canonStatus)),
        })
      }
    }

    // The pointed member's recorded family that no join already shows: a low arc between the two portraits.
    const shownByCouple = new Set(layout.couples.flatMap((couple) => couple.relationshipIds))
    const seen = new Set<string>()
    for (const connection of tree.connections) {
      if (!pointed || connection.entityId !== pointed) continue
      if (shownByCouple.has(connection.relationshipId) || seen.has(connection.relationshipId))
        continue
      const a = face(connection.entityId)
      const b = face(connection.relatedEntityId)
      if (!a || !b || connection.entityId === connection.relatedEntityId) continue
      seen.add(connection.relationshipId)

      const x1 = x(a)
      const x2 = x(b)
      const y1 = a.top - bounds.top
      const y2 = b.top - bounds.top
      const lift = Math.max(28, Math.abs(x2 - x1) / 5)
      const top = Math.min(y1, y2) - lift
      drawn.push({
        id: connection.relationshipId,
        d: `M ${x1} ${y1} C ${x1} ${top}, ${x2} ${top}, ${x2} ${y2}`,
        part: 'other',
        semantic: CONNECTION,
        canonStatus: connection.canonStatus,
      })
    }

    setEdges(drawn)
    setSize({ width: root.scrollWidth, height: root.scrollHeight })
  }, [tree, layout, pointed])

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
  const caption = pointed
    ? tree.connections
        .filter((connection) => connection.entityId === pointed)
        .map((connection) => sentence(connection))
    : []

  function sentence(connection: FamilyTreeConnection) {
    const from = family.nodes.get(connection.entityId)?.name ?? ''
    const to = family.nodes.get(connection.relatedEntityId)?.name ?? ''
    return `${from} ${connection.label.charAt(0).toLowerCase()}${connection.label.slice(1)} ${to}`
  }

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
        onPointerOver={() => setHovered(member.entityId)}
        onPointerLeave={() =>
          setHovered((current) => (current === member.entityId ? null : current))
        }
        onFocus={() => setFocused(member.entityId)}
        onBlur={() => setFocused((current) => (current === member.entityId ? null : current))}
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
                data-part={edge.part}
                data-semantic={edge.semantic}
                data-canon={edge.canonStatus}
              />
            ))}
          </svg>

          {ROWS.map((row) => {
            const units = layout.rows[row.position]
            const isFocalRow = row.position === 'siblings'
            if (units.length === 0 || (isFocalRow && !focal && family.rows.siblings.length === 0)) {
              return null
            }

            return (
              <section
                className="familytree__row"
                key={row.position}
                aria-label={row.label}
                data-row={row.position}
              >
                <h2 className="familytree__rowlabel">{row.label}</h2>
                <ul className="familytree__members">
                  {units.flatMap((unit) => {
                    const members = unit
                      .map((id) => family.nodes.get(id))
                      .filter((member): member is FamilyTreeNode => !!member)
                      .filter((member) => member.entityId !== tree.focalEntityId || !!focal)
                    if (members.length < 2) {
                      return members.map((member) =>
                        node(member, member.entityId === tree.focalEntityId),
                      )
                    }
                    // A couple, or a chain of them, kept together so a narrow screen never wraps between them.
                    return [
                      <li className="familyunit" key={`unit-${unit.join('-')}`}>
                        <ul className="familyunit__members">
                          {members.map((member) =>
                            node(member, member.entityId === tree.focalEntityId),
                          )}
                        </ul>
                      </li>,
                    ]
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </div>

      <p className="familytree__caption" aria-live="polite" data-testid="family-caption">
        {caption.length > 0
          ? caption.join('; ')
          : 'Point at or focus a person to see the other family recorded for them.'}
      </p>

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
          Children hang from the line between their parents. Side by side and joined: parents of one
          child, or family recorded in one generation. Faded lines and dashed rings mark what is not
          Canon yet. Open the eye beside a portrait to see that person&rsquo;s details, with every
          connection written out.
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

/** The least settled of some links, so a Draft link is never drawn as settled family history. */
function leastSettled(statuses: CanonStatusValue[]): CanonStatusValue {
  return statuses.reduce<CanonStatusValue>(
    (least, status) => (status < least ? status : least),
    CanonStatus.Canon,
  )
}
