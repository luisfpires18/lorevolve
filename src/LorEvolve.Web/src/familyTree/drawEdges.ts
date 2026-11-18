import { arrangeFamily } from './layout'
import type { FamilyTree } from './types'
import { CanonStatus, type CanonStatusValue } from '../lore/types'
import { FamilySemantic } from '../relationships/types'
import type { RefObject } from 'react'

/**
 * One drawn line. `stem` drops from a parent, or from between two co-parents, to the bar its children hang from; `drop`
 * falls from that bar to one child; `couple` joins two members side by side; `curve` is a parent link the generations
 * cannot draw straight (two positions in one row, a circle of links); `other` is recorded family, drawn only while one
 * of its members is pointed at or focused.
 */
export interface Edge {
  id: string
  d: string
  part: 'stem' | 'drop' | 'couple' | 'curve' | 'other'
  semantic: number
  canonStatus: number
}
/** Marks a line as a recorded family link rather than a parent link. */
export const CONNECTION = -1

export function drawEdges({
  root,
  cards,
  layout,
  tree,
  pointed,
}: {
  root: HTMLDivElement
  cards: RefObject<Map<string, HTMLLIElement | null>>
  layout: ReturnType<typeof arrangeFamily>
  tree: FamilyTree
  pointed: string | null
}) {
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
      above.set(link.childEntityId, [...(above.get(link.childEntityId) ?? []), link.parentEntityId])
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
        group.parents.includes(link.parentEntityId) && group.children.includes(link.childEntityId),
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
  return drawn
}

/** The least settled of some links, so a Draft link is never drawn as settled family history. */
function leastSettled(statuses: CanonStatusValue[]): CanonStatusValue {
  return statuses.reduce<CanonStatusValue>(
    (least, status) => (status < least ? status : least),
    CanonStatus.Canon,
  )
}
