import { useState, type Dispatch, type SetStateAction } from 'react'
import { t } from '../i18n'
import type { Load } from '../lib/useAsyncRead'
import { useStoryScenes } from '../stories/useStoryScenes'
import { useUniverseStories } from '../stories/useUniverseStories'
import type { Draft } from './recordDraft'

/**
 * Reads the universe's stories for the picker, and the chosen story for its scenes. A read that fails says so in the
 * form's message line once, when it fails, so a later save still clears it as before.
 */
export function useRecordStories({
  universeId,
  draft,
  setMessage,
}: {
  universeId: string
  draft: Draft
  setMessage: Dispatch<SetStateAction<string | null>>
}) {
  const storiesLoad = useUniverseStories(universeId)
  const storyLoad = useStoryScenes(universeId, draft.storyId)
  const [seen, setSeen] = useState<[Load<unknown>, Load<unknown>]>([storiesLoad, storyLoad])
  if (seen[0] !== storiesLoad || seen[1] !== storyLoad) {
    setSeen([storiesLoad, storyLoad])
    if (seen[0] !== storiesLoad && storiesLoad.kind === 'error')
      setMessage(t('ai.knowledge.form.storiesFailed'))
    if (seen[1] !== storyLoad && storyLoad.kind === 'error')
      setMessage(t('ai.knowledge.form.storyFailed'))
  }
  return {
    stories: storiesLoad.kind === 'ready' ? storiesLoad.value : null,
    storyRead: storyLoad.kind === 'ready' ? storyLoad.value : null,
  }
}
