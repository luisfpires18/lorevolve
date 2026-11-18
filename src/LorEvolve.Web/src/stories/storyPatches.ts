import type { VisibilityValue } from '../publishing/types'
import { readingOrder } from './structure'
import type { Chapter, PlotArc, Scene, StoryDetail } from './types'
import type { useStoryState } from './useStoryState'

/** How the story on screen is changed in place: the functions below make the same changes the API just made. */
export function storyPatches({ setState }: Pick<ReturnType<typeof useStoryState>, 'setState'>) {
  function showStory(next: StoryDetail) {
    setState((current) => (current.kind === 'ready' ? { ...current, story: next } : current))
  }
  function patchScene(id: string, patch: Partial<Scene>) {
    setState((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            story: {
              ...current.story,
              scenes: current.story.scenes.map((scene) =>
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
            story: {
              ...current.story,
              arcs: current.story.arcs.map((arc) => (arc.id === id ? { ...arc, visibility } : arc)),
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
            story: {
              ...current.story,
              arcs: next,
              scenes: readingOrder(next, current.story.chapters, current.story.scenes),
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
            story: {
              ...current.story,
              scenes: readingOrder(current.story.arcs, current.story.chapters, [
                ...current.story.scenes.filter((scene) => scene.chapterId !== chapterId),
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
            story: {
              ...current.story,
              chapters: nextChapters,
              scenes: readingOrder(current.story.arcs, nextChapters, current.story.scenes),
            },
          }
        : current,
    )
  }
  return { showStory, patchScene, patchArc, showArcs, showContainer, showChapters }
}
