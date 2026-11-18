import type { FieldImageShapeValue, FieldKindValue, FieldSemanticValue } from './fieldKinds'

export interface FieldOption {
  id: string
  value: string
  displayOrder: number
}

export interface FieldDefinition {
  id: string
  name: string
  kind: FieldKindValue
  isRequired: boolean
  displayOrder: number
  defaultValue: string | null
  options: FieldOption[]
  semantic: FieldSemanticValue | null
  /**
   * For a link to an entity: the one type its entries must be of, exactly that type, by id. Null means any Lore type, an
   * explicit choice. Always null for every other kind. Never worked out from a name.
   */
  targetEntityTypeId: string | null
  /**
   * For a link to an entity: the semantic group its entries' types must be in, by id, or null. Never set beside
   * `targetEntityTypeId`. Read by its membership as it is now, never by the group's name.
   */
  targetGroupId: string | null
  /**
   * When the field was archived, or null while it is active (Issue #39). An archived field keeps everything - its values,
   * options, meaning, limit and `isRequired` - and is out of every form, read and filter until it is restored.
   */
  archivedAt: string | null
  /** How many entries hold a value for this field, the Trash included. A field with any is archived, never deleted. */
  entryCount: number
  /** How many of those entries are in the Trash. */
  trashedEntryCount: number
  /** Whether an older version of any entry recorded a value for it: that keeps it from being deleted too. */
  usedInHistory: boolean
  /** The definition's edit version, which an edit names as `expectedVersion` (ADR 0043). */
  version: number
  /**
   * The section of its type this field is shown in, or null for the ungrouped fields shown first (Issue #26). Presentation
   * only. An archived field keeps it, so a restore puts it back where it was.
   */
  sectionId: string | null
  /** For an Image field: the frame its picture is cropped to. Null for every other kind. */
  imageShape: FieldImageShapeValue | null
}

/** One optional section of a type's fields (Issue #26): a heading and a fold, nothing more. */
export interface FieldSection {
  id: string
  name: string
  /** Its place among the type's sections, from 1. */
  displayOrder: number
  /** Whether forms and entries show it folded at first. A reader's own toggles are never stored. */
  startsCollapsed: boolean
}

/**
 * A semantic group of Lore types (Issue #36): a creator's own classification - Runes, say - that several concrete types can
 * belong to. Classification only: nothing is inherited. Being in a group offers the Family Tree only when the author has
 * enabled the group for it (`familyTreeEnabled`, Issue #37).
 */
export interface EntityTypeGroup {
  id: string
  name: string
  /** The member types' ids, in no meaningful order. */
  typeIds: string[]
  /** The author enabled this group for the Family Tree: every type in it is offered there. Never set by a name. */
  familyTreeEnabled: boolean
}

export interface EntityType {
  id: string
  name: string
  description: string | null
  /** The type's icon key - one of `TYPE_ICONS` - or null for the neutral fallback. */
  icon: string | null
  accentColor: string | null
  displayOrder: number
  /** Every entry of this type, the Trash included: a trashed entry keeps its type and still stops it being deleted. */
  entityCount: number
  /** How many of those are in the Trash. */
  trashedEntityCount: number
  /**
   * How many of its own entries Lore lists: not in the Trash and not archived (an archived entry only comes from an older
   * backup). What a type's card on Lore's front page sums over its branch; never what deletion reads.
   */
  listedEntityCount: number
  /** The type's active fields: the ones entry forms, filters and Lore read. */
  fields: FieldDefinition[]
  /** Its archived fields (Issue #39), apart so nothing that reads `fields` can meet one by accident. */
  archivedFields: FieldDefinition[]
  /** Its fields' sections in order (Issue #26); empty for a type that has none, which shows its fields as one list. */
  fieldSections: FieldSection[]
  /** The layout's own version, which a layout save names as `expectedVersion`. Apart from every field's `version`. */
  fieldLayoutVersion: number
  /**
   * The type's own Family Tree switch, the one a save writes. Set by the author, never read from the name (ADR 0040).
   */
  familyTreeEligible: boolean
  /**
   * Whether the Family Tree is offered for this type's entries: its own switch, or a group enabled for the tree that it is in
   * (Issue #37). Worked out by the API; read only.
   */
  familyTreeOffered: boolean
  /**
   * The type this one sits beneath, or null for a root. The parent's fields pass down: a nested type has every field of the types above it. A list of types arrives
   * parent before descendants, but the tree is always built from these ids (`lore/typeTree.ts`), never from positions.
   */
  parentId: string | null
}

/** No types read: one stable empty list, so what is worked out from the types is not worked out again each render. */
export const NO_TYPES: EntityType[] = []
