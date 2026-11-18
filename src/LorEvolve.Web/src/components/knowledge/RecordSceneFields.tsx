import type { Dispatch, SetStateAction } from 'react'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { Draft } from '../../knowledge/recordDraft'
import type { readingOrder } from '../../stories/structure'
import type { StoryDetail, StorySummary } from '../../stories/types'

/** The story and the scene a record is learnt in, shown while it is not known from the start. */
export function RecordSceneFields({
  storyId,
  sceneId,
  draft,
  setDraft,
  stories,
  errors,
  story,
  groupedScenes,
}: {
  storyId: string
  sceneId: string
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
  stories: StorySummary[] | null
  errors: Record<string, string>
  story: StoryDetail | null
  groupedScenes: { label: string; scenes: ReturnType<typeof readingOrder> }[]
}) {
  return (
    <>
      <Field label={t('ai.knowledge.form.story')} id={storyId}>
        {(control) => (
          <select
            {...control}
            className="field__input"
            value={draft.storyId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                storyId: event.target.value,
                sceneId: '',
              }))
            }
            data-testid="knowledge-story"
          >
            <option value="">
              {stories === null
                ? t('ai.knowledge.form.readingStories')
                : t('ai.knowledge.form.chooseStory')}
            </option>
            {(stories ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('ai.knowledge.form.scene')} id={sceneId} error={errors.sceneId}>
        {(control) => (
          <select
            {...control}
            className="field__input"
            value={draft.sceneId}
            disabled={draft.storyId === ''}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sceneId: event.target.value }))
            }
            data-testid="knowledge-scene"
          >
            <option value="">
              {draft.storyId === ''
                ? t('ai.knowledge.form.chooseStoryFirst')
                : story === null
                  ? t('ai.knowledge.form.readingScenes')
                  : t('ai.knowledge.form.chooseSceneOption')}
            </option>
            {groupedScenes.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}
