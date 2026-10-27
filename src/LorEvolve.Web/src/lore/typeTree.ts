import type { EntityType } from './types'

/**
 * The one reading of a universe's type forest on the client (ADR 0007 amendment, 2026-10-01): built from ids, never from the
 * order a list arrived in, and walked with a visited set so a malformed graph ends the walk instead of looping. Every screen
 * that lists types for a choice - Lore, the Types screen, New entry, Mass create - orders them through `ordered`.
 */
export interface TypeNode {
  type: EntityType
  depth: number
  /** Root first, the type itself last. */
  path: EntityType[]
  children: TypeNode[]
}

export interface TypeTree {
  roots: TypeNode[]
  /** Every type, a parent before its descendants, siblings by their place, then name. */
  ordered: TypeNode[]
  byId: Map<string, TypeNode>
}

function bySiblingOrder(a: EntityType, b: EntityType) {
  return (
    a.displayOrder - b.displayOrder ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.id < b.id ? -1 : 1)
  )
}

export function buildTypeTree(types: readonly EntityType[]): TypeTree {
  const ids = new Set(types.map((type) => type.id))
  const childrenOf = new Map<string | null, EntityType[]>()
  for (const type of types) {
    const parent = type.parentId !== null && ids.has(type.parentId) ? type.parentId : null
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), type])
  }
  for (const list of childrenOf.values()) list.sort(bySiblingOrder)

  const byId = new Map<string, TypeNode>()
  const ordered: TypeNode[] = []

  function visit(type: EntityType, parent: TypeNode | null): TypeNode | null {
    if (byId.has(type.id)) return null
    const node: TypeNode = {
      type,
      depth: parent ? parent.depth + 1 : 0,
      path: [...(parent?.path ?? []), type],
      children: [],
    }
    byId.set(type.id, node)
    ordered.push(node)
    for (const child of childrenOf.get(type.id) ?? []) {
      const below = visit(child, node)
      if (below) node.children.push(below)
    }
    return node
  }

  const roots: TypeNode[] = []
  for (const root of childrenOf.get(null) ?? []) {
    const node = visit(root, null)
    if (node) roots.push(node)
  }
  // Anything no root reaches - only a malformed graph - is listed as a root rather than lost.
  for (const type of [...types].sort(bySiblingOrder)) {
    const node = visit(type, null)
    if (node) roots.push(node)
  }

  return { roots, ordered, byId }
}

/** The type's ancestors and itself, as one readable label: "Runes › Material Runes › Metal Runes". */
export function typePathLabel(node: TypeNode) {
  return node.path.map((type) => type.name).join(' › ')
}

/** The type and every type beneath it, at any depth. */
export function branchIds(node: TypeNode): Set<string> {
  const ids = new Set<string>()
  const pending = [node]
  while (pending.length > 0) {
    const current = pending.pop()!
    if (ids.has(current.type.id)) continue
    ids.add(current.type.id)
    pending.push(...current.children)
  }
  return ids
}

/**
 * Every type for a `<select>` that picks exactly one: in the hierarchy's order, each labelled with its whole path - the
 * words say where it sits, not indentation a select cannot show.
 */
export function typeChoices(types: readonly EntityType[]) {
  return buildTypeTree(types).ordered.map((node) => ({
    type: node.type,
    label: typePathLabel(node),
  }))
}
