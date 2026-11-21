import { useEffect, useState } from 'react'
import type { EraScene, EraStory } from './types'
import { getStory } from '../stories/api'
import { useUniverseStories } from '../stories/useUniverseStories'
import { sceneChoices } from '../stories/useStoryScenes'

/** The universe's stories to offer an era, and the scenes of each chosen story, read again only when the choice changes. */
export function useEraStoryChoices({
  universeId,
  stories,
}: {
  universeId: string
  stories: EraStory[]
}) {
  // A read that fails offers no story, as an empty one does.
  const load = useUniverseStories(universeId)
  const available = load.kind === 'loading' ? null : load.kind === 'ready' ? load.value : []
  const [storyScenes, setStoryScenes] = useState<Record<string, EraScene[]>>({})

  const storyKey = stories.map((story) => story.id).join(',')

  useEffect(() => {
    const controller = new AbortController()
    for (const story of stories) {
      if (story.isTrashed || storyScenes[story.id]) continue
      getStory(universeId, story.id, controller.signal)
        .then((detail) =>
          setStoryScenes((current) => ({ ...current, [story.id]: sceneChoices(detail) })),
        )
        .catch(() => undefined)
    }
    return () => controller.abort()
    // Read again only when the chosen stories change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId, storyKey])

  return { available, storyScenes }
}
