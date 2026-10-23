import { apiFetch } from '../lib/api'
import {
  SourceKind,
  type AssistantAnswer,
  type AssistantHistoryMessage,
  type AssistantSource,
  type AssistantStatus,
  type AssistantUsage,
  type SourceKindValue,
} from './types'

/** The API refuses longer questions; the box stops at the same length. */
export const QUESTION_MAX_LENGTH = 1000

/** How many earlier messages go with a question. The API keeps no more than this, so sending more would only cost bytes. */
export const HISTORY_SENT = 6

function assistantPath(universeId: string) {
  return `/api/universes/${universeId}/assistant`
}

/** Whether the assistant can answer in this universe. Calls no model. */
export function getAssistantStatus(universeId: string, signal?: AbortSignal) {
  return apiFetch<AssistantStatus>(assistantPath(universeId), { signal })
}

/** The account's own allowance: questions used in the current window. Counts nothing itself. */
export function getAssistantUsage(signal?: AbortSignal) {
  return apiFetch<AssistantUsage>('/api/profile/assistant-usage', { signal })
}

/**
 * One question, with the conversation so far. Aborting it stops the work on the server too. `propose` is the person's own
 * explicit request for changes (ADR 0047): only then may the assistant stage a proposal, and never apply one.
 */
export function askAssistant(
  universeId: string,
  question: string,
  history: AssistantHistoryMessage[],
  signal?: AbortSignal,
  propose = false,
) {
  return apiFetch<AssistantAnswer>(assistantPath(universeId), {
    method: 'POST',
    body: JSON.stringify({
      question,
      history: history.slice(-HISTORY_SENT),
      ...(propose ? { mode: 'propose' } : {}),
    }),
    signal,
  })
}

/** How each source is named beside its title. Words, as the search bar names its results. */
export const SOURCE_KIND_LABELS: Record<SourceKindValue, string> = {
  [SourceKind.Lore]: 'Lore',
  [SourceKind.Story]: 'Story',
  [SourceKind.Chapter]: 'Chapter',
  [SourceKind.Scene]: 'Scene',
  [SourceKind.PlotArc]: 'Arc',
  [SourceKind.PlotBeat]: 'Beat',
  [SourceKind.TimelineMoment]: 'Moment',
}

/**
 * Where a source opens: the same places a search result opens (`search/api.ts` `resultPath`), and a moment on the
 * timeline the way the timeline links one. Built here from the kind and ids LoreX sent, never from anything the model wrote.
 */
export function sourcePath(universeId: string, source: AssistantSource) {
  const universe = `/app/universes/${universeId}`
  const story = `${universe}/stories/${source.storyId ?? ''}`

  switch (source.kind) {
    case SourceKind.Lore:
      return `${universe}/lore/${source.id}`
    case SourceKind.Story:
      return story
    case SourceKind.Chapter:
      return `${story}#chapter-${source.id}`
    case SourceKind.Scene:
      return `${story}#scene-${source.id}`
    case SourceKind.PlotArc:
      return `${story}/plot#arc-${source.id}`
    case SourceKind.PlotBeat:
      return `${story}/plot#beat-${source.id}`
    case SourceKind.TimelineMoment:
      return `${universe}/timeline?moment=${source.id}`
  }
}
