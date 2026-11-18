import type { KeyboardEvent } from 'react'
import type { TypeNode, TypeTree } from './typeTree'

/** One level of the navigation: the type whose children it lists (null for the top), and those children. */
export interface Level {
  parent: TypeNode | null
  nodes: TypeNode[]
}

/**
 * The levels on screen for a choice: the top-level categories always, then - for each type on the chosen path that holds
 * others - a row of what is inside it. Choosing Runes shows the categories and Runes' subtypes; choosing Original Runes
 * (inside Runes) shows the same two rows with Original Runes current; a subtype that itself holds types adds a third row.
 * Nothing nested is ever listed beside the top-level categories.
 */
export function levelsFor(tree: TypeTree, selected: TypeNode | null): Level[] {
  const levels: Level[] = [{ parent: null, nodes: tree.roots }]
  for (const type of selected?.path ?? []) {
    const node = tree.byId.get(type.id)
    if (node && node.children.length > 0) levels.push({ parent: node, nodes: node.children })
  }
  return levels
}

/** Arrow keys, Home and End move along one row of links. */
export function move(event: KeyboardEvent<HTMLUListElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const links = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a')]
  const at = links.indexOf(document.activeElement as HTMLAnchorElement)
  if (at === -1) return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? links.length - 1
        : Math.min(links.length - 1, Math.max(0, at + (event.key === 'ArrowLeft' ? -1 : 1)))
  links[next]?.focus()
}
