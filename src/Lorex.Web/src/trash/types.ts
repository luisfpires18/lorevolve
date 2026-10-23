import type { CanonStatusValue } from '../lore/types'

/** Mirrors the backend enum. What a row in the Trash is. */
export const TrashKind = {
  Entry: 0,
  Story: 1,
  Chapter: 2,
  Scene: 3,
  PlotArc: 4,
  PlotBeat: 5,
  WorldRule: 6,
  Relationship: 7,
  TimelineEvent: 8,
} as const

export type TrashKindValue = (typeof TrashKind)[keyof typeof TrashKind]

/** How each kind is named on screen. Words, never a colour alone. */
export const TRASH_KIND_LABELS: Record<TrashKindValue, string> = {
  [TrashKind.Entry]: 'Entry',
  [TrashKind.Story]: 'Story',
  [TrashKind.Chapter]: 'Chapter',
  [TrashKind.Scene]: 'Scene',
  [TrashKind.PlotArc]: 'Arc',
  [TrashKind.PlotBeat]: 'Beat',
  [TrashKind.WorldRule]: 'World rule',
  [TrashKind.Relationship]: 'Relationship',
  [TrashKind.TimelineEvent]: 'Timeline moment',
}

/** Mirrors the backend enum. Why a row cannot be restored yet, if it cannot. */
export const TrashBlock = {
  None: 0,
  StoryInTrash: 1,
  ArcInTrash: 2,
  /** An entry a relationship connects is in the Trash: that entry comes back first. */
  EntryInTrash: 3,
} as const

export type TrashBlockValue = (typeof TrashBlock)[keyof typeof TrashBlock]

/**
 * Mirrors the backend enum. What restoring an entry or story would do on the public portal: Trash keeps its public
 * selection (ADR 0036), so a restore can publish it again at once.
 */
export const TrashPublication = {
  None: 0,
  /** Selected, but its universe is private (or a story has no public summary): restoring shows nothing to readers. */
  Hidden: 1,
  /** Selected in a public universe: restoring makes it readable again straight away. */
  Visible: 2,
} as const

export type TrashPublicationValue = (typeof TrashPublication)[keyof typeof TrashPublication]

/**
 * One row in the Trash. Deliberately thin: it answers what was thrown away, where it was and when, and everything it
 * held is readable again the moment it comes back.
 *
 * The entry members are set for an entry only (and `canonStatus` for a moment). `storyId` is set for everything from a
 * story - a story's own id for a story - and `storyTitle` for what sits inside one; `plotArcId` and `plotArcTitle` for a
 * beat. A relationship's `name` reads it whole, and `entryId` is the entry it starts from, where it is opened once back.
 */
export interface TrashItem {
  kind: TrashKindValue
  id: string
  name: string
  trashedAt: string
  entityTypeId: string | null
  entityTypeName: string | null
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null
  canonStatus: CanonStatusValue | null
  storyId: string | null
  storyTitle: string | null
  plotArcId: string | null
  plotArcTitle: string | null
  blockedBy: TrashBlockValue
  publication: TrashPublicationValue
  entryId?: string | null
}

export interface TrashPage {
  items: TrashItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** What erasing a story answers: every scene that went with it, live or in the Trash on its own. */
export interface TrashErasedStory {
  id: string
  erasedSceneIds: string[]
}

/** What a bulk delete answers: how many selected rows went, and every entry and scene that went with them. */
export interface TrashBulkErased {
  deleted: number
  erasedEntryIds: string[]
  erasedSceneIds: string[]
}
