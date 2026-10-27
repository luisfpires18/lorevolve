import { CanonStatus, type CanonStatusValue } from '../lore/types'
import { FAMILY_SEMANTIC_WORDS } from '../relationships/types'
import {
  FAMILY_POSITIONS,
  type FamilyPosition,
  type FamilyTree,
  type FamilyTreeLink,
  type FamilyTreeNode,
} from './types'

/** One recorded way of being a relative: the links it walks, what it reads as, and how settled it is. */
export interface FamilyPathReading {
  linkIds: string[]
  /** "Biological parent", "Shares Mara (biological for both)", "Mara's adoptive parent". */
  text: string
  /** The least settled link on the path, so a Draft connection is never read as Canon. */
  canonStatus: CanonStatusValue
}

export interface FamilyRelation {
  position: FamilyPosition
  paths: FamilyPathReading[]
}

/** One entry as the tree draws it: where it is placed, and every position it holds. */
export interface FamilyMember {
  node: FamilyTreeNode
  place: FamilyPosition
  relations: FamilyRelation[]
}

export interface FamilyReading {
  focal: FamilyTreeNode | null
  /** Members by the row they are drawn in. An entry with several positions is drawn once, in the nearest one. */
  rows: Record<FamilyPosition, FamilyMember[]>
  links: Map<string, FamilyTreeLink>
  nodes: Map<string, FamilyTreeNode>
}

/**
 * Where an entry is drawn when it holds more than one position - a parent who is also a grandparent through
 * another line, a sibling who is also a parent. The nearest position wins, and the card still names every
 * position it holds, so nothing is hidden by the choice.
 */
const PLACE_ORDER: FamilyPosition[] = [
  'parents',
  'children',
  'siblings',
  'grandparents',
  'grandchildren',
]

/**
 * Turns the API's ids and paths into what a reader sees. Derivation happens on the server; this only puts
 * names and words to it, and never invents a position that was not derived - in particular, a sibling is
 * never called full or half.
 */
export function readFamilyTree(tree: FamilyTree): FamilyReading {
  const nodes = new Map(tree.nodes.map((node) => [node.entityId, node]))
  const links = new Map(tree.links.map((link) => [link.relationshipId, link]))
  const focal = nodes.get(tree.focalEntityId) ?? null
  const held = new Map<string, FamilyRelation[]>()

  for (const position of FAMILY_POSITIONS) {
    for (const relative of tree[position]) {
      const paths = relative.paths.map((path) =>
        reading(position, path, relative.entityId, tree.focalEntityId, nodes, links),
      )
      held.set(relative.entityId, [...(held.get(relative.entityId) ?? []), { position, paths }])
    }
  }

  const rows: Record<FamilyPosition, FamilyMember[]> = {
    grandparents: [],
    parents: [],
    siblings: [],
    children: [],
    grandchildren: [],
  }

  for (const [entityId, relations] of held) {
    const node = nodes.get(entityId)
    if (!node) continue

    const place =
      PLACE_ORDER.find((candidate) =>
        relations.some((relation) => relation.position === candidate),
      ) ?? relations[0].position

    rows[place].push({ node, place, relations })
  }

  for (const position of FAMILY_POSITIONS) {
    rows[position].sort((first, second) => first.node.name.localeCompare(second.node.name))
  }

  return { focal, rows, links, nodes }
}

/** What one path of parent links reads as, from the focal entry's side. */
function reading(
  position: FamilyPosition,
  path: string[],
  relativeId: string,
  focalId: string,
  nodes: Map<string, FamilyTreeNode>,
  links: Map<string, FamilyTreeLink>,
): FamilyPathReading {
  const steps = path.map((id) => links.get(id)).filter((link): link is FamilyTreeLink => !!link)
  const canonStatus = steps.reduce<CanonStatusValue>(
    (least, link) => (link.canonStatus < least ? link.canonStatus : least),
    CanonStatus.Canon,
  )

  const name = (entityId: string) => nodes.get(entityId)?.name ?? 'a hidden entry'
  const word = (link: FamilyTreeLink | undefined) =>
    link ? FAMILY_SEMANTIC_WORDS[link.semantic] : ''

  return { linkIds: path, canonStatus, text: text() }

  function text() {
    const [first, second] = steps

    if (position === 'parents') return capitalised(`${word(first)} parent`)
    if (position === 'children') return capitalised(`${word(first)} child`)

    // A sibling is a shared parent and nothing more. Which links each of them holds is worth saying; how much
    // of a family they share is not something the recorded links prove.
    if (position === 'siblings') {
      const shared = name(first?.parentEntityId ?? focalId)
      return word(first) === word(second)
        ? `Shares ${shared} (${word(first)} for both)`
        : `Shares ${shared} (${word(first)} for ${name(focalId)}, ${word(second)} for ${name(relativeId)})`
    }

    // The middle entry is on the tree too, so naming it says which line this one comes down: the parent the
    // grandparent stands above, or the child the grandchild stands below.
    const middle = position === 'grandparents' ? first?.parentEntityId : first?.childEntityId
    const through = name(middle ?? focalId)

    return position === 'grandparents'
      ? `${through}'s ${word(second)} parent`
      : `${through}'s ${word(second)} child`
  }
}

function capitalised(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One link as a sentence: "Mara bore Lia". */
export function linkSentence(link: FamilyTreeLink, nodes: Map<string, FamilyTreeNode>) {
  const parent = nodes.get(link.parentEntityId)?.name ?? 'a hidden entry'
  const child = nodes.get(link.childEntityId)?.name ?? 'a hidden entry'
  return `${parent} ${link.relationshipTypeName} ${child}`
}
