import type { VisibilityValue } from '../publishing/types'
import { readingOrder } from './structure'
import type { Chapter, PlotArc, Scene, StoryDetail } from './types'
import type { useStoryState } from './useStoryState'

/** How the story on screen is changed in place: the functions below make the same changes the API just made. */
export function storyPatches({ setState }: Pick<ReturnType<typeof useStoryState>, 'setState'>) {
  function showStory(next: StoryDetail) {
    setState((current) => (current.kind === 'ready' ? { ...current, value: next } : current))
  }
  function patchScene(id: string, patch: Partial<Scene>) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              scenes: current.value.scenes.map((scene) =>
                scene.id === id ? { ...scene, ...patch } : scene,
              ),
            },
          }
        : current,
    )
  }

  function patchArc(id: string, visibility: VisibilityValue) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              arcs: current.value.arcs.map((arc) => (arc.id === id ? { ...arc, visibility } : arc)),
            },
          }
        : current,
    )
  }

  function showArcs(next: PlotArc[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              arcs: next,
              scenes: readingOrder(next, current.value.chapters, current.value.scenes),
            },
          }
        : current,
    )
  }

  /** One container's scenes replaced, the rest of the story left as it is. */
  function showContainer(chapterId: string | null, replacement: Scene[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              scenes: readingOrder(current.value.arcs, current.value.chapters, [
                ...current.value.scenes.filter((scene) => scene.chapterId !== chapterId),
                ...replacement,
              ]),
            },
          }
        : current,
    )
  }

  function showChapters(nextChapters: Chapter[]) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            value: {
              ...current.value,
              chapters: nextChapters,
              scenes: readingOrder(current.value.arcs, nextChapters, current.value.scenes),
            },
          }
        : current,
    )
  }
  return { showStory, patchScene, patchArc, showArcs, showContainer, showChapters }
}
