import { apiFetch } from '../lib/api'
import type {
  Chapter,
  ChapterInput,
  PlotArc,
  PlotArcInput,
  PlotBeat,
  PlotBeatInput,
  Scene,
  SceneInput,
  SceneManuscript,
  SceneManuscriptInput,
  ManuscriptRevisionDetail,
  ManuscriptRevisionSummary,
  StoryDetail,
  StoryInput,
  StorySummary,
  SceneLoreReference,
} from './types'

function base(universeId: string) {
  return `/api/universes/${universeId}/stories`
}

function scenes(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/scenes`
}

function chapters(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/chapters`
}

function plotArcs(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/plot-arcs`
}

function plotBeats(universeId: string, storyId: string) {
  return `${base(universeId)}/${storyId}/plot-beats`
}

export function listStories(universeId: string, signal?: AbortSignal) {
  return apiFetch<StorySummary[]>(base(universeId), { signal })
}

export function getStory(universeId: string, storyId: string, signal?: AbortSignal) {
  return apiFetch<StoryDetail>(`${base(universeId)}/${storyId}`, { signal })
}

export function createStory(universeId: string, input: StoryInput) {
  return apiFetch<StoryDetail>(base(universeId), { method: 'POST', body: JSON.stringify(input) })
}

export function updateStory(universeId: string, storyId: string, input: StoryInput) {
  return apiFetch<StoryDetail>(`${base(universeId)}/${storyId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** To the Trash: the story's chapters, scenes, prose and plot go with it, and come back with it. The lore stays. */
export function deleteStory(universeId: string, storyId: string) {
  return apiFetch<void>(`${base(universeId)}/${storyId}`, { method: 'DELETE' })
}

/** Appended after every chapter already in the story. */
export function createChapter(universeId: string, storyId: string, input: ChapterInput) {
  return apiFetch<Chapter>(chapters(universeId, storyId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateChapter(
  universeId: string,
  storyId: string,
  chapterId: string,
  input: ChapterInput,
) {
  return apiFetch<Chapter>(`${chapters(universeId, storyId)}/${chapterId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Moves the chapter only to the Trash: its scenes move, in order, to the end of Unchaptered. */
export function deleteChapter(universeId: string, storyId: string, chapterId: string) {
  return apiFetch<void>(`${chapters(universeId, storyId)}/${chapterId}`, { method: 'DELETE' })
}

/** The story's whole chapter order: every chapter id, each once, first first. */
export function reorderChapters(universeId: string, storyId: string, chapterIds: string[]) {
  return apiFetch<Chapter[]>(`${chapters(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ chapterIds }),
  })
}

/** Appended after every scene already in its chapter, or in Unchaptered. */
export function createScene(universeId: string, storyId: string, input: SceneInput) {
  return apiFetch<Scene>(scenes(universeId, storyId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * The entries a manuscript's mentions name, by id (issue 31): this universe's only, trashed ones marked, in the order asked.
 * An id that names nothing here is simply absent from the answer.
 */
export function listLoreReferences(universeId: string, ids: string[], signal?: AbortSignal) {
  return apiFetch<SceneLoreReference[]>(
    `/api/universes/${universeId}/lore-references?ids=${ids.map(encodeURIComponent).join(',')}`,
    { signal },
  )
}

/** One live scene, as the scene form shows it. */
export function getScene(universeId: string, storyId: string, sceneId: string) {
  return apiFetch<Scene>(`${scenes(universeId, storyId)}/${sceneId}`)
}

export function updateScene(
  universeId: string,
  storyId: string,
  sceneId: string,
  input: SceneInput,
) {
  return apiFetch<Scene>(`${scenes(universeId, storyId)}/${sceneId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** To the Trash, with its prose, saved versions and links. The rest of its container closes up. */
export function deleteScene(universeId: string, storyId: string, sceneId: string) {
  return apiFetch<void>(`${scenes(universeId, storyId)}/${sceneId}`, { method: 'DELETE' })
}

/**
 * One container's whole narrative order - the chapter `chapterId` names, or Unchaptered when it is
 * null: every scene id in it, each once, first told first. Answers with that container's scenes.
 */
export function reorderScenes(
  universeId: string,
  storyId: string,
  chapterId: string | null,
  sceneIds: string[],
) {
  return apiFetch<Scene[]>(`${scenes(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ chapterId, sceneIds }),
  })
}

/** The code on the 409 a manuscript save gets when the prose was saved somewhere else after it was opened. */
export const MANUSCRIPT_CHANGED = 'scene_manuscript_changed'

/** The code on the 409 a story save gets when the story was saved somewhere else after its form opened (ADR 0043). */
export const STORY_CHANGED = 'story_changed'

/** The code on the 409 a scene save gets when the scene was saved or moved somewhere else after its form opened. */
export const SCENE_CHANGED = 'scene_changed'

function manuscript(universeId: string, storyId: string, sceneId: string) {
  return `${scenes(universeId, storyId)}/${sceneId}/manuscript`
}

/** One scene's prose. Read only when that scene is opened for writing - never with the story or its outline. */
export function getSceneManuscript(
  universeId: string,
  storyId: string,
  sceneId: string,
  signal?: AbortSignal,
) {
  return apiFetch<SceneManuscript>(manuscript(universeId, storyId, sceneId), { signal })
}

/** Replaces the scene's prose with exactly `input.content`, if `input.expectedVersion` is still the latest save. */
export function saveSceneManuscript(
  universeId: string,
  storyId: string,
  sceneId: string,
  input: SceneManuscriptInput,
) {
  return apiFetch<SceneManuscript>(manuscript(universeId, storyId, sceneId), {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** The manuscript's saved versions, newest first, with no text. Read when its history is opened - never with the prose. */
export function listManuscriptRevisions(
  universeId: string,
  storyId: string,
  sceneId: string,
  signal?: AbortSignal,
) {
  return apiFetch<ManuscriptRevisionSummary[]>(
    `${manuscript(universeId, storyId, sceneId)}/revisions`,
    { signal },
  )
}

/** One saved version, whole. */
export function getManuscriptRevision(
  universeId: string,
  storyId: string,
  sceneId: string,
  revisionId: string,
) {
  return apiFetch<ManuscriptRevisionDetail>(
    `${manuscript(universeId, storyId, sceneId)}/revisions/${revisionId}`,
  )
}

/** Puts a saved version back as the newest, refused like a stale save if the prose moved on since it was read. */
export function restoreManuscriptRevision(
  universeId: string,
  storyId: string,
  sceneId: string,
  revisionId: string,
  expectedVersion: number,
) {
  return apiFetch<SceneManuscript>(
    `${manuscript(universeId, storyId, sceneId)}/revisions/${revisionId}/restore`,
    { method: 'POST', body: JSON.stringify({ expectedVersion }) },
  )
}

/** The story's whole plot: every arc in order, each with its beats in order and their links resolved. */
export function listPlotArcs(universeId: string, storyId: string, signal?: AbortSignal) {
  return apiFetch<PlotArc[]>(plotArcs(universeId, storyId), { signal })
}

/** Appended after every arc already in the story. */
export function createPlotArc(universeId: string, storyId: string, input: PlotArcInput) {
  return apiFetch<PlotArc>(plotArcs(universeId, storyId), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePlotArc(
  universeId: string,
  storyId: string,
  plotArcId: string,
  input: PlotArcInput,
) {
  return apiFetch<PlotArc>(`${plotArcs(universeId, storyId)}/${plotArcId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** To the Trash: the arc's beats and their links go with it, and come back with it. No scene, chapter or entry moves. */
export function deletePlotArc(universeId: string, storyId: string, plotArcId: string) {
  return apiFetch<void>(`${plotArcs(universeId, storyId)}/${plotArcId}`, { method: 'DELETE' })
}

/** The story's whole arc order: every arc id, each once, first first. Answers with every arc. */
export function reorderPlotArcs(universeId: string, storyId: string, plotArcIds: string[]) {
  return apiFetch<PlotArc[]>(`${plotArcs(universeId, storyId)}/order`, {
    method: 'PUT',
    body: JSON.stringify({ plotArcIds }),
  })
}

/** Appended after every beat already in the arc. */
export function createPlotBeat(
  universeId: string,
  storyId: string,
  plotArcId: string,
  input: PlotBeatInput,
) {
  return apiFetch<PlotBeat>(`${plotArcs(universeId, storyId)}/${plotArcId}/beats`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** The whole beat. A different `plotArcId` moves it to the end of that arc. */
export function updatePlotBeat(
  universeId: string,
  storyId: string,
  plotBeatId: string,
  input: PlotBeatInput,
) {
  return apiFetch<PlotBeat>(`${plotBeats(universeId, storyId)}/${plotBeatId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** To the Trash, with its links. The scenes and lore it points at stay. */
export function deletePlotBeat(universeId: string, storyId: string, plotBeatId: string) {
  return apiFetch<void>(`${plotBeats(universeId, storyId)}/${plotBeatId}`, { method: 'DELETE' })
}

/** One arc's whole beat order: every beat id in it, each once. Answers with that arc's beats. */
export function reorderPlotBeats(
  universeId: string,
  storyId: string,
  plotArcId: string,
  plotBeatIds: string[],
) {
  return apiFetch<PlotBeat[]>(`${plotArcs(universeId, storyId)}/${plotArcId}/beats/order`, {
    method: 'PUT',
    body: JSON.stringify({ plotBeatIds }),
  })
}

/**
 * Moves one scene into the chapter `chapterId` names, or Unchaptered when it is null - at `position`
 * among the scenes there, or last when it is null. The scene itself is unchanged. Answers with the
 * story's whole structure, because two containers moved.
 */
export function moveScene(
  universeId: string,
  storyId: string,
  sceneId: string,
  chapterId: string | null,
  position: number | null = null,
) {
  return apiFetch<StoryDetail>(`${scenes(universeId, storyId)}/${sceneId}/position`, {
    method: 'PUT',
    body: JSON.stringify({ chapterId, position }),
  })
}
