import type { Chapter, PlotArc, Scene } from './types'

/**
 * One container's scenes in the order they are told: the chapter `chapterId` names, or Unchaptered when
 * it is null. A scene's `sortOrder` is its place inside its container, never across the story.
 */
export function scenesIn(scenes: Scene[], chapterId: string | null) {
  return scenes
    .filter((scene) => scene.chapterId === chapterId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Every scene in the order the story reads: Unchaptered first, then chapter by chapter in the chapters'
 * order, each container in its own narrative order. The order the API sends, restored after a change
 * made on screen before the save lands.
 */
export function readingOrder(chapters: Chapter[], scenes: Scene[]) {
  const rank = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const place = (scene: Scene) =>
    scene.chapterId === null ? -1 : (rank.get(scene.chapterId) ?? chapters.length)

  return [...scenes].sort((a, b) => place(a) - place(b) || a.sortOrder - b.sortOrder)
}

/** A beat as a scene names it: which arc, which step, and where each sits. */
export interface SceneBeatReference {
  arcId: string
  arcTitle: string
  arcIndex: number
  beatId: string
  beatTitle: string
  beatIndex: number
}

/**
 * Which beats point at each scene, arc by arc and step by step. Read from the beats alone - a scene holds no beat,
 * and this is only how the page draws what the beats already say.
 */
export function beatsByScene(arcs: PlotArc[]) {
  const byScene = new Map<string, SceneBeatReference[]>()

  arcs.forEach((arc, arcIndex) => {
    arc.beats.forEach((beat, beatIndex) => {
      for (const sceneId of beat.sceneIds) {
        const references = byScene.get(sceneId) ?? []
        references.push({
          arcId: arc.id,
          arcTitle: arc.title,
          arcIndex,
          beatId: beat.id,
          beatTitle: beat.title,
          beatIndex,
        })
        byScene.set(sceneId, references)
      }
    })
  })

  return byScene
}
