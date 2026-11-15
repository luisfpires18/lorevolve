import type { ChronologyValue } from '../chronology/types'
import type { EntityImageRef } from '../lore/types'
import type { VisibilityValue } from '../publishing/types'
import { t } from '../i18n'

/** Mirrors the backend enum. How far along the telling is - never whether any of it is true. */
export const StoryStatus = {
  Planning: 0,
  Drafting: 1,
  Complete: 2,
} as const

export type StoryStatusValue = (typeof StoryStatus)[keyof typeof StoryStatus]

/** Getters, so each word is looked up in the current language when read, never frozen at import. */
export const STORY_STATUS_LABELS: Record<StoryStatusValue, string> = {
  get [StoryStatus.Planning]() {
    return t('stories.status.planning')
  },
  get [StoryStatus.Drafting]() {
    return t('stories.status.drafting')
  },
  get [StoryStatus.Complete]() {
    return t('stories.status.complete')
  },
}

/** A status's stable key: what a test id or an address is built from, never the translated word. */
export const STORY_STATUS_KEYS: Record<StoryStatusValue, string> = {
  [StoryStatus.Planning]: 'planning',
  [StoryStatus.Drafting]: 'drafting',
  [StoryStatus.Complete]: 'complete',
}

export const STORY_STATUS_ORDER: StoryStatusValue[] = [
  StoryStatus.Planning,
  StoryStatus.Drafting,
  StoryStatus.Complete,
]

export interface StorySummary {
  id: string
  title: string
  premise: string | null
  status: StoryStatusValue
  sceneCount: number
  createdAt: string
  updatedAt: string
}

/**
 * A lore entry as a scene shows it, read from the entry on every request. The scene stores only the
 * id, so nothing here is a copy that could fall out of step with the lore.
 */
export interface SceneLoreReference {
  entityId: string
  name: string
  entityTypeId: string
  entityTypeName: string
  entityTypeIcon: string | null
  entityTypeAccentColor: string | null

  /**
   * The entry is in the Trash. Still reported, because the form sends the scene's references back
   * whole on every save and dropping one here would delete it. Shown as unavailable and not linked.
   */
  isTrashed: boolean
  image: EntityImageRef | null
}

/**
 * An optional grouping of a story's scenes: structure, not content. Its number - "Chapter 3" - is its
 * position inside its arc (or among the chapters in no arc), worked out on screen and never stored, so `title` is
 * only what the author wrote. `sortOrder` is one order across the whole story; `plotArcId` is the live arc it is told
 * in, or null for none (ADR 0070).
 */
export interface Chapter {
  id: string
  storyId: string
  sortOrder: number
  title: string
  summary: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  plotArcId: string | null
}

/** One step of a scene, in its order (ADR 0070): a title, and an optional note under it. */
export interface SceneBeat {
  id: string
  sortOrder: number
  title: string
  note: string | null
}

/** A beat as a scene save sends it. */
export interface SceneBeatInput {
  title: string
  note: string | null
}

/**
 * One scene. `chapterId` is its container - null for Unchaptered - and `sortOrder` its place in that
 * container's telling; `chronology` is where it happens in the world. Order and chronology are
 * independent, and the client never orders scenes by chronology.
 */
export interface Scene {
  id: string
  storyId: string
  chapterId: string | null
  sortOrder: number
  title: string
  summary: string | null
  notes: string | null
  pov: SceneLoreReference | null
  chronology: ChronologyValue | null
  entities: SceneLoreReference[]
  createdAt: string
  updatedAt: string
  /** Whether the author selected the scene's outline - title and summary - for the story's public page (ADR 0039). */
  visibility: VisibilityValue
  /** Whether the author selected the scene's prose for the story's public page, under its title. */
  manuscriptVisibility: VisibilityValue
  /** What the scene form's save names as the version it was written over (ADR 0043). */
  version: number
  /** The scene's beats, in order (ADR 0070). */
  beats: SceneBeat[]
}

/**
 * One story with its whole structure, resolved in one request: its arcs in order, chapters in order, and every scene -
 * Unchaptered first, then chapter by chapter, each container in its own narrative order.
 */
export interface StoryDetail {
  id: string
  title: string
  premise: string | null
  status: StoryStatusValue
  arcs: PlotArc[]
  chapters: Chapter[]
  scenes: Scene[]
  createdAt: string
  updatedAt: string
  /** What the story form's save names as the version it was written over (ADR 0043). */
  version: number
}

export interface StoryInput {
  title: string
  premise: string | null
  status: StoryStatusValue
  /** The story's version an edit was written over; left out on create. */
  expectedVersion?: number
}

/**
 * Everything a client may set on a scene. The order is not here: a scene is appended to its container,
 * and only the order and position routes move it inside one. `chapterId` null is Unchaptered; a different
 * chapter than the scene is in moves it to the end of that one.
 */
export interface SceneInput {
  title: string
  summary: string | null
  notes: string | null
  povEntityId: string | null
  chronology: ChronologyValue | null
  entityIds: string[]
  chapterId: string | null
  /** The scene's version an edit was written over; left out on create. */
  expectedVersion?: number
  /** The scene's whole list of beats, in order. Left out, the scene keeps the beats it has. */
  beats?: SceneBeatInput[]
}

/**
 * How long one scene's prose may be, in characters as JavaScript counts them (`string.length`, UTF-16 units). Mirrors
 * `StoryLimits.ManuscriptMaxLength` on the API, which refuses anything longer; the editor says so before a save.
 */
export const MANUSCRIPT_MAX_LENGTH = 1_000_000

/**
 * A scene's prose, read on its own route and never part of the story read. Plain text, exactly as written. `content` is
 * '' for a scene nothing has been written for; `updatedAt` is null until the first save, and goes back untouched with the
 * next one.
 */
export interface SceneManuscript {
  sceneId: string
  content: string
  updatedAt: string | null
  /** What the next save names: 0 until the first save, then advanced by every save that changes the prose. */
  version: number
}

/**
 * One save of a scene's prose: the whole text, and the `version` it was written over, so a save over prose that changed
 * somewhere else is refused rather than silently winning (ADR 0043).
 */
export interface SceneManuscriptInput {
  content: string
  expectedVersion: number
}

/** Mirrors the backend enum. What a saved version of a manuscript was. */
export const ManuscriptRevisionKind = {
  Created: 0,
  Edited: 1,
  Restored: 2,
} as const

export type ManuscriptRevisionKindValue =
  (typeof ManuscriptRevisionKind)[keyof typeof ManuscriptRevisionKind]

/** A row in a manuscript's history. No text; `isEmpty` says the save emptied the prose. */
export interface ManuscriptRevisionSummary {
  id: string
  number: number
  kind: ManuscriptRevisionKindValue
  restoredFromRevisionId: string | null
  createdAt: string
  isEmpty: boolean

  /** The username of the account that saved this version; null when none was recorded. */
  actorName: string | null
}

/** One saved version of a manuscript, whole. */
export interface ManuscriptRevisionDetail {
  id: string
  number: number
  kind: ManuscriptRevisionKindValue
  restoredFromRevisionId: string | null
  createdAt: string
  content: string
}

/**
 * Everything a client may set on a chapter. No number and no order: both are its position. `plotArcId` is read by a create
 * only - the arc a new chapter starts in; moving one between arcs is its own route.
 */
export interface ChapterInput {
  title: string
  summary: string | null
  notes: string | null
  plotArcId?: string | null
}

/**
 * An arc of a story (ADR 0070): story structure, holding chapters. Its number - "Arc 2" - is its position, drawn and never
 * stored; its chapters name it themselves.
 */
export interface PlotArc {
  id: string
  storyId: string
  sortOrder: number
  title: string
  description: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Whether the author published the arc - its title and description - on the story's public page (ADR 0039). */
  visibility: VisibilityValue
}

/** Everything a client may set on an arc. No number and no order. */
export interface PlotArcInput {
  title: string
  description: string | null
  notes: string | null
}
