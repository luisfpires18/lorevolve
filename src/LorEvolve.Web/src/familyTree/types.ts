import type { CanonStatusValue, EntityImageRef } from '../lore/types'
import type { FamilySemanticValue, PerspectiveValue } from '../relationships/types'

/** One entry in the tree. Enough to recognise it; its article, fields and dates are not here. */
export interface FamilyTreeNode {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue
  image: EntityImageRef | null
  /** Whether its type is enabled for the Family Tree - false for an entry recorded in a family before that existed. */
  entityTypeFamilyTreeEligible: boolean
}

/**
 * One stored relationship read as a parent link: the kind's family meaning says the source is the parent
 * and the target the child. The link keeps its own Canon status, so a Draft link is never drawn as
 * settled family history.
 */
export interface FamilyTreeLink {
  relationshipId: string
  parentEntityId: string
  childEntityId: string
  semantic: FamilySemanticValue
  canonStatus: CanonStatusValue
  relationshipTypeId: string
  relationshipTypeName: string
}

/**
 * A relative, and every path of parent links that makes it one. A path starts at the link touching the
 * focal entry: a parent's path is its one link, a grandparent's is the parent's link then the
 * grandparent's, a sibling's is the shared parent's link to the focal entry then that parent's link to
 * the sibling, a grandchild's is the child's link then the grandchild's.
 */
export interface FamilyTreeRelative {
  entityId: string
  paths: string[][]
}

/** Parent links the tree read that go round in a circle, and the entries on it. */
export interface FamilyTreeLoop {
  entityIds: string[]
  relationshipIds: string[]
}

/**
 * One authored non-structural family link touching a drawn member, `entityId` - "uncle of", "married to" - read
 * from that member's side: `label` is already the right wording. A link between two drawn members comes once from
 * each side. Listed, never derived from: it places nobody in the tree. The related entry is among the nodes
 * whether or not it is drawn.
 */
export interface FamilyTreeConnection {
  relationshipId: string
  relatedEntityId: string
  perspective: PerspectiveValue
  label: string
  canonStatus: CanonStatusValue
  relationshipTypeId: string
  entityId: string
}

export interface FamilyTree {
  focalEntityId: string
  generationsEachWay: number
  nodes: FamilyTreeNode[]
  links: FamilyTreeLink[]
  parents: FamilyTreeRelative[]
  grandparents: FamilyTreeRelative[]
  siblings: FamilyTreeRelative[]
  children: FamilyTreeRelative[]
  grandchildren: FamilyTreeRelative[]
  loops: FamilyTreeLoop[]
  connections: FamilyTreeConnection[]
  /** A parent's sibling: the parent's link, the grandparent's link to the parent, the grandparent's to them. */
  auntsUncles: FamilyTreeRelative[]
  /** An aunt or uncle's child: the aunt or uncle's path, then their link to the cousin. */
  cousins: FamilyTreeRelative[]
  /** A sibling's child: the sibling's path, then the sibling's link to them. */
  niecesNephews: FamilyTreeRelative[]
}

/** Where a relative sits relative to the focal entry. The order is the order the tree is drawn in. */
export const FAMILY_POSITIONS = [
  'grandparents',
  'parents',
  'auntsUncles',
  'siblings',
  'cousins',
  'children',
  'niecesNephews',
  'grandchildren',
] as const

export type FamilyPosition = (typeof FAMILY_POSITIONS)[number]

/** The generations the tree draws, top to bottom. */
export type FamilyRow = 'grandparents' | 'parents' | 'siblings' | 'children' | 'grandchildren'

/** Which generation each position stands in: aunts and uncles beside the parents, cousins beside the entry, and so on. */
export const ROW_OF: Record<FamilyPosition, FamilyRow> = {
  grandparents: 'grandparents',
  parents: 'parents',
  auntsUncles: 'parents',
  siblings: 'siblings',
  cousins: 'siblings',
  children: 'children',
  niecesNephews: 'children',
  grandchildren: 'grandchildren',
}

/** What each position is called on screen, for one relative and for the group. */
export const POSITION_LABELS: Record<FamilyPosition, { one: string; many: string }> = {
  grandparents: { one: 'Grandparent', many: 'Grandparents' },
  parents: { one: 'Parent', many: 'Parents' },
  siblings: { one: 'Sibling', many: 'Siblings' },
  children: { one: 'Child', many: 'Children' },
  grandchildren: { one: 'Grandchild', many: 'Grandchildren' },
  auntsUncles: { one: 'Aunt or uncle', many: 'Aunts and uncles' },
  cousins: { one: 'Cousin', many: 'Cousins' },
  niecesNephews: { one: 'Niece or nephew', many: 'Nieces and nephews' },
}

/** A member named on a family's summary. */
export interface FamilyDiscoveryMember {
  entityId: string
  name: string
}

/**
 * A family as the universe's links make it: no id or name of its own, so it opens at `focusEntityId`, a member whose type
 * is enabled for the Family Tree. `memberCount` is the whole group; `previewMembers` a few, the focal member first.
 */
export interface FamilyDiscoveryItem {
  focusEntityId: string
  memberCount: number
  previewMembers: FamilyDiscoveryMember[]
}

export interface FamilyDiscoveryPage {
  items: FamilyDiscoveryItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
