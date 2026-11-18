import { useEffect, useState } from 'react'
import type { EraScene, EraStory } from './types'
import { getStory, listStories } from '../stories/api'
import { readingOrder } from '../stories/structure'
import type { StorySummary } from '../stories/types'

/** The universe's stories to offer an era, and the scenes of each chosen story, read again only when the choice changes. */
export function useEraStoryChoices({
  universeId,
  stories,
}: {
  universeId: string
  stories: EraStory[]
}) {
  const [available, setAvailable] = useState<StorySummary[] | null>(null)
  const [storyScenes, setStoryScenes] = useState<Record<string, EraScene[]>>({})

  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setAvailable)
      .catch(() => {
        if (!controller.signal.aborted) setAvailable([])
      })
    return () => controller.abort()
  }, [universeId])

  const storyKey = stories.map((story) => story.id).join(',')

  useEffect(() => {
    const controller = new AbortController()
    for (const story of stories) {
      if (story.isTrashed || storyScenes[story.id]) continue
      getStory(universeId, story.id, controller.signal)
        .then((detail) =>
          setStoryScenes((current) => ({
            ...current,
            [story.id]: readingOrder(detail.arcs, detail.chapters, detail.scenes).map((scene) => ({
              id: scene.id,
              storyId: detail.id,
              title: scene.title,
              storyTitle: detail.title,
              isTrashed: false,
            })),
          })),
        )
        .catch(() => undefined)
    }
    return () => controller.abort()
    // Read again only when the chosen stories change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId, storyKey])

  return { available, storyScenes }
}
