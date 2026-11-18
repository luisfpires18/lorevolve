import type { TypeNode, TypeTree } from './typeTree'

/** A type's place in the tree: its sibling group, and the row its branch ends on. */
export function typeSiblings({ tree }: { tree: TypeTree }) {
  /** The type's own sibling group - its parent's children, or the roots - which is all it can be reordered among. */
  function siblingsOf(node: TypeNode) {
    return node.depth === 0
      ? tree.roots
      : tree.byId.get(node.path[node.path.length - 2]!.id)!.children
  }

  /** The row a branch ends on: the type's last descendant, or the type itself. */
  function lastOf(node: TypeNode): TypeNode {
    return node.children.length > 0 ? lastOf(node.children[node.children.length - 1]!) : node
  }

  return { siblingsOf, lastOf }
}
