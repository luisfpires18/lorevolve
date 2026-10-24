import type { ChronologyValue } from '../chronology/types'
import type { FieldKindValue } from '../lore/types'
import type { RevisionKindValue } from '../lore/revisions'

/**
 * One field an era overrides, in the members an entry's own value uses, or `cleared`: no value in that era, which only an
 * optional field may be. A field an era does not list reads from the entry itself - never from another era (Issue #41).
 */
export interface EraField {
  fieldDefinitionId: string
  name: string
  kind: FieldKindValue
  cleared: boolean
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[]
  optionValues: string[]
  referencedEntityId: string | null
  referencedEntityName: string | null
  referencedEntityIsTrashed: boolean
  eraId: string | null
}

export interface EraStory {
  id: string
  title: string
  isTrashed: boolean
}

export interface EraScene {
  id: string
  storyId: string
  title: string
  storyTitle: string
  isTrashed: boolean
}

/** One era of one entry: a creator-defined stretch of its story, in the author's order, with only what differs then. */
export interface Era {
  id: string
  name: string
  description: string | null
  sortOrder: number
  start: ChronologyValue | null
  end: ChronologyValue | null
  stories: EraStory[]
  scenes: EraScene[]
  fields: EraField[]
}

/** An era or form named by a form or ability, as it reads now. */
export interface NamedRef {
  id: string
  name: string
}

export interface MomentRef {
  id: string
  title: string
  isTrashed: boolean
}

/** When a form or ability was first unlocked (Issue #42): each part optional, none derived from another. */
export interface UnlockMilestone {
  era: NamedRef | null
  scene: EraScene | null
  moment: MomentRef | null
}

/**
 * One form an entry can take (Issue #42): available exactly in the eras ticked - nothing follows from era order or from where it
 * was first unlocked - and used in the scenes listed, which nothing checks against availability.
 */
export interface Form {
  id: string
  name: string
  description: string | null
  sortOrder: number
  unlock: UnlockMilestone
  eras: NamedRef[]
  scenes: EraScene[]
}

/** One significant ability, with the forms it belongs to - none, one or several. */
export interface Ability extends Form {
  forms: NamedRef[]
}

/** An entry's progression, read on its own route. `version` is what the next save names: 0 until the first save. */
export interface Progression {
  entityId: string
  eras: Era[]
  updatedAt: string | null
  version: number
  forms: Form[]
  abilities: Ability[]
}

export interface FormInput {
  id: string | null
  name: string
  description: string | null
  unlockEraId: string | null
  unlockSceneId: string | null
  unlockMomentId: string | null
  eraIds: string[]
  sceneIds: string[]
}

export interface AbilityInput extends FormInput {
  formIds: string[]
}

export interface EraFieldInput {
  fieldDefinitionId: string
  cleared: boolean
  text: string | null
  number: number | null
  boolean: boolean | null
  date: string | null
  optionIds: string[] | null
  referencedEntityId: string | null
  eraId: string | null
}

export interface EraInput {
  /** Null for a new era. */
  id: string | null
  name: string
  description: string | null
  start: ChronologyValue | null
  end: ChronologyValue | null
  storyIds: string[]
  sceneIds: string[]
  fields: EraFieldInput[]
}

/** The whole progression, saved at once over the version it was read at. A list left out keeps what is stored. */
export interface ProgressionInput {
  eras: EraInput[]
  expectedVersion: number
  forms?: FormInput[]
  abilities?: AbilityInput[]
}

export interface ProgressionRevisionSummary {
  id: string
  number: number
  kind: RevisionKindValue
  restoredFromRevisionId: string | null
  createdAt: string
  actorName: string | null
}

export interface ProgressionRevisionDetail extends ProgressionRevisionSummary {
  eras: Era[]
  forms: Form[]
  abilities: Ability[]
}
