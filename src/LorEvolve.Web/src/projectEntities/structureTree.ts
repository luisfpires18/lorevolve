// The tree's shape and its pure helpers (#290), import-free so `node --test` can run them.

/** A project's rule-shaped structure (#290): acts, sequences, scenes, beats, and the levels later formats add. */
import type { FieldImageRef } from '../lore/types'

/** The longest text one node may hold: the API's `SeriesLimits.ScriptMaxLength`, which refuses anything longer. */
export const NODE_BODY_MAX_LENGTH = 400_000

/** The levels that may hold a picture (#295). */
export const ART_LEVELS = ['page', 'panel']

export type ProjectNodeSummary = {
  id: string
  parentId: string | null
  level: string
  title: string | null
  summary: string | null
  /** The tree gives only the body's size; one node's body comes from its own route. */
  bodyLength: number
  sortOrder: number
  version: number
  /** A page's or panel's picture (#295); `fieldId` is the node id. */
  image?: FieldImageRef | null
}

/** The tree with the rules that shape it, so the client never holds its own copy of them. */
export type ProjectStructureTree = {
  format: string
  roots: string[]
  children: Record<string, string[]>
  nodes: ProjectNodeSummary[]
}

/** A node's children in their places; `null` gives the roots. */
export function childrenOf(tree: ProjectStructureTree, parentId: string | null) {
  return tree.nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** The levels that may be added under a node of `level`, or at the root when `level` is null. */
export function addableLevels(tree: ProjectStructureTree, level: string | null) {
  return level === null ? tree.roots : (tree.children[level] ?? [])
}

/** How many nodes sit inside `nodeId`, at any depth: what a delete takes with it. */
export function descendantCount(tree: ProjectStructureTree, nodeId: string): number {
  return childrenOf(tree, nodeId).reduce(
    (count, child) => count + 1 + descendantCount(tree, child.id),
    0,
  )
}

/**
 * Where a node may move to: every other node whose level may hold it and that is not inside it, plus the root
 * (`null`) when its level may be a root. Its current parent is left out.
 */
export function moveTargets(
  tree: ProjectStructureTree,
  node: ProjectNodeSummary,
): (ProjectNodeSummary | null)[] {
  const inside = new Set<string>([node.id])
  const walk = (id: string) =>
    childrenOf(tree, id).forEach((child) => {
      inside.add(child.id)
      walk(child.id)
    })
  walk(node.id)

  const parents: (ProjectNodeSummary | null)[] = tree.nodes.filter(
    (candidate) =>
      !inside.has(candidate.id) &&
      candidate.id !== node.parentId &&
      (tree.children[candidate.level] ?? []).includes(node.level),
  )

  return node.parentId !== null && tree.roots.includes(node.level) ? [null, ...parents] : parents
}
