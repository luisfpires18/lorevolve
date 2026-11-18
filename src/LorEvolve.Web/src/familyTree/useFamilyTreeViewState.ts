import { useMemo, useRef, useState } from 'react'
import { arrangeFamily } from './layout'
import { readFamilyTree } from './reading'
import type { FamilyRow, FamilyTree } from './types'
import type { FamilyTreeNode } from './types'
import type { Edge } from './drawEdges'

/**
 * The rows, top to bottom. The focal entry stands in the middle row with its siblings and cousins beside it. Each
 * row's heading is `places.treeView.rows.<position>`.
 */
export const ROWS: { position: FamilyRow }[] = [
  { position: 'grandparents' },
  { position: 'parents' },
  { position: 'siblings' },
  { position: 'children' },
  { position: 'grandchildren' },
]

export function useFamilyTreeViewState({ tree }: { tree: FamilyTree }) {
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
  return {
    family,
    layout,
    scroller,
    canvas,
    focalCard,
    cards,
    edges,
    setEdges,
    size,
    setSize,
    setHovered,
    setFocused,
    setOpen,
    shown,
    pointed,
  }
}
