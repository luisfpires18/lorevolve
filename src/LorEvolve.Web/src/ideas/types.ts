/** Mirrors the backend enum. What an idea points at - stated on every reference, never inferred from an id. */
export const IdeaReferenceKind = {
  Entity: 0,
  Story: 1,
  Scene: 2,
  PlotArc: 3,
  PlotBeat: 4,
} as const

export type IdeaReferenceKindValue = (typeof IdeaReferenceKind)[keyof typeof IdeaReferenceKind]

/** The kinds in the order a picker offers them and a list of references reads. */
export const IDEA_REFERENCE_KINDS: IdeaReferenceKindValue[] = [
  IdeaReferenceKind.Entity,
  IdeaReferenceKind.Story,
  IdeaReferenceKind.Scene,
  IdeaReferenceKind.PlotArc,
  IdeaReferenceKind.PlotBeat,
]

/** How each kind is named on screen. Words, never a colour alone. */
export const IDEA_REFERENCE_KIND_LABELS: Record<IdeaReferenceKindValue, string> = {
  [IdeaReferenceKind.Entity]: 'Lore',
  [IdeaReferenceKind.Story]: 'Story',
  [IdeaReferenceKind.Scene]: 'Scene',
  [IdeaReferenceKind.PlotArc]: 'Arc',
  [IdeaReferenceKind.PlotBeat]: 'Beat',
}

/** Mirrors `IdeaLimits`, so a bound is said before a save rather than after. */
export const IDEA_TITLE_MAX_LENGTH = 200
export const IDEA_BODY_MAX_LENGTH = 20_000

export interface IdeaUniverse {
  id: string
  name: string
  accentColor: string | null
  isArchived: boolean
}

/**
 * One reference, resolved: the target's name as it is now. `isInTrash` says the target, or what it sits in, is in the
 * Trash - shown, and not opened. The context members say where it is.
 */
export interface IdeaReference {
  kind: IdeaReferenceKindValue
  id: string
  name: string
  isInTrash: boolean
  entityTypeName: string | null
  storyId: string | null
  storyTitle: string | null
  plotArcTitle: string | null
}

export interface IdeaSummary {
  id: string
  title: string
  excerpt: string
  isExcerptShortened: boolean
  universe: IdeaUniverse | null
  referenceCount: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface IdeaPage {
  items: IdeaSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface IdeaDetail {
  id: string
  title: string
  body: string
  universe: IdeaUniverse | null
  references: IdeaReference[]
  createdAt: string
  updatedAt: string
}

/** A save, whole. `expectedUpdatedAt` names the save this edit was written over; ignored on create. */
export interface IdeaInput {
  title: string
  body: string
  universeId: string | null
  references: { kind: IdeaReferenceKindValue; id: string }[]
  expectedUpdatedAt: string | null
}

/**
 * Where a list of ideas is opened: every idea the account has, one universe's, or one story's. The same ideas seen from
 * three places, never three kinds of idea. A story's ideas are the universe's ideas with an explicit reference to the
 * story or to a scene, arc or beat in it.
 */
export type IdeasScope =
  | { kind: 'all' }
  | { kind: 'universe'; universe: { id: string; name: string } }
  | {
      kind: 'story'
      universe: { id: string; name: string }
      story: { id: string }
    }

/** Which ideas a list shows. `universeId` and `unassigned` are never both set; `storyId` needs `universeId`. */
export interface IdeaQuery {
  universeId: string | null
  storyId?: string | null
  unassigned: boolean
  deleted: boolean
  search: string
  page: number
}
