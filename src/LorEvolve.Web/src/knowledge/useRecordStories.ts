import { useEffect } from 'react'
import { t } from '../i18n'
import { getStory, listStories } from '../stories/api'
import type { StoryDetail, StorySummary } from '../stories/types'
import type { Dispatch, SetStateAction } from 'react'
import type { Draft } from './recordDraft'

/** Reads the universe's stories for the picker, and the chosen story for its scenes. */
export function useRecordStories({
  universeId,
  draft,
  setStories,
  setStoryRead,
  setMessage,
}: {
  universeId: string
  draft: Draft
  setStories: Dispatch<SetStateAction<StorySummary[] | null>>
  setStoryRead: Dispatch<SetStateAction<StoryDetail | null>>
  setMessage: Dispatch<SetStateAction<string | null>>
}) {
  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('ai.knowledge.form.storiesFailed'))
      })
    return () => controller.abort()
  }, [universeId])

  useEffect(() => {
    if (draft.storyId === '') return
    const controller = new AbortController()
    getStory(universeId, draft.storyId, controller.signal)
      .then(setStoryRead)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('ai.knowledge.form.storyFailed'))
      })
    return () => controller.abort()
  }, [universeId, draft.storyId])
}
