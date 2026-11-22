import { useCallback } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import type { EraScene } from '../progression/types'
import { getStory } from './api'
import { readingOrder } from './structure'
import type { StoryDetail } from './types'

/** A story's scenes in reading order, as a scene picker offers them. */
export const sceneChoices = (story: StoryDetail): EraScene[] =>
  readingOrder(story.arcs, story.chapters, story.scenes).map((scene) => ({
    id: scene.id,
    storyId: story.id,
    title: scene.title,
    storyTitle: story.title,
    isTrashed: false,
  }))

/**
 * The story a picker chose, read for its scenes. No story chosen (`''`) reads nothing; another story shows loading in
 * the same render, never the last one's scenes.
 */
export function useStoryScenes(universeId: string, storyId: string) {
  const read = useCallback(
    (signal: AbortSignal) => (storyId ? getStory(universeId, storyId, signal) : undefined),
    [universeId, storyId],
  )
  return useAsyncRead(read, { key: storyId }).load
}
