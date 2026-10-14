/** Mirrors the backend enum. Who wrote a message in the conversation. */
export const AssistantRole = {
  User: 0,
  Assistant: 1,
} as const

export type AssistantRoleValue = (typeof AssistantRole)[keyof typeof AssistantRole]

/**
 * Mirrors the backend enum. What a part of an answer is: stated in the universe, drawn from it, an idea of the
 * assistant's, or a note (something not recorded, a question outside the universe). The API only lets a part stand as
 * recorded when it cites something it actually read.
 */
export const SegmentKind = {
  Recorded: 0,
  Inference: 1,
  Suggestion: 2,
  Note: 3,
} as const

export type SegmentKindValue = (typeof SegmentKind)[keyof typeof SegmentKind]

/** Mirrors the backend enum. What a source is, so it opens in its own place. */
export const SourceKind = {
  Lore: 0,
  Story: 1,
  Chapter: 2,
  Scene: 3,
  PlotArc: 4,
  PlotBeat: 5,
  TimelineMoment: 6,
} as const

export type SourceKindValue = (typeof SourceKind)[keyof typeof SourceKind]

/** One piece of the universe an answer rests on, as LoreX names it. `storyId` is set for what lives in a story. */
export interface AssistantSource {
  kind: SourceKindValue
  id: string
  title: string
  storyId: string | null
}

export interface AssistantSegment {
  kind: SegmentKindValue
  text: string
  sourceIds: string[]
}

export interface AssistantAnswer {
  segments: AssistantSegment[]
  sources: AssistantSource[]
  /** The assistant reached its reading limit before it finished looking. */
  isIncomplete: boolean
}

export interface AssistantStatus {
  isAvailable: boolean
}

export interface AssistantHistoryMessage {
  role: AssistantRoleValue
  text: string
}
