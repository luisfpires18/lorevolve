/**
 * A creative project as the API sends it (#138). The enums travel as numbers, so these are the numbers the API
 * declares and nothing here guesses one: an unknown value is refused by the server, not corrected here.
 */
export const ProjectKind = {
  Writing: 0,
  Game: 1,
  Series: 2,
  Film: 3,
  Comic: 4,
} as const

export type ProjectKindValue = (typeof ProjectKind)[keyof typeof ProjectKind]

export const ProjectLifecycle = {
  Planning: 0,
  Active: 1,
  Complete: 2,
  Archived: 3,
} as const

export type ProjectLifecycleValue = (typeof ProjectLifecycle)[keyof typeof ProjectLifecycle]

/** The universe a project is linked to, as much of it as a list or a header draws. */
export interface ProjectUniverse {
  id: string
  name: string
  accentColor: string | null
  isArchived: boolean
}

export interface ProjectDetail {
  id: string
  name: string
  kind: ProjectKindValue
  lifecycle: ProjectLifecycleValue
  subtype: string | null
  summary: string
  universe: ProjectUniverse | null
  /** True when this account owns the project, rather than reaching it through the linked universe. */
  isOwned: boolean
  createdAt: string
  updatedAt: string
  version: number
  /**
   * Set when this row is a Story shown as the Writing Project it already is (#140). Nothing of the story is copied:
   * the row is read from the story on every request, and the story's own address is where its content lives, so a
   * client follows this id rather than opening a project page that would have nothing of its own to show.
   */
  storyId: string | null
}

/** Creating a project, or saving one whole. `expectedVersion` is ignored on create. */
export interface ProjectInput {
  name: string
  kind: ProjectKindValue
  lifecycle: ProjectLifecycleValue
  subtype: string | null
  summary: string
  universeId: string | null
  expectedVersion: number | null
}
