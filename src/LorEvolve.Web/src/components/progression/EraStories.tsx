import { useId } from 'react'
import { t, useI18n } from '../../i18n'
import { Field } from '../Field'
import type { EraScene, EraStory } from '../../progression/types'
import { useEraStoryChoices } from '../../progression/useEraStoryChoices'
import { Token, TokenList } from '../Token'

/**
 * The stories an era covers, and scenes of those stories: each chosen one as a token with Remove, the universe's other live
 * stories to add, and the chosen stories' scenes in reading order. A story or scene in the Trash stays chosen and says so; it
 * is never offered.
 */
export function EraStories({
  universeId,
  stories,
  scenes,
  onChange,
  storyError,
  sceneError,
}: {
  universeId: string
  stories: EraStory[]
  scenes: EraScene[]
  onChange: (stories: EraStory[], scenes: EraScene[]) => void
  storyError?: string
  sceneError?: string
}) {
  useI18n()
  const storySelect = useId()
  const sceneSelect = useId()
  const { available, storyScenes } = useEraStoryChoices({ universeId, stories })

  const chosenStories = new Set(stories.map((story) => story.id))
  const chosenScenes = new Set(scenes.map((scene) => scene.id))
  const offeredStories = (available ?? []).filter((story) => !chosenStories.has(story.id))
  const offeredScenes = stories.flatMap((story) =>
    (storyScenes[story.id] ?? []).filter((scene) => !chosenScenes.has(scene.id)),
  )

  return (
    <>
      <Field
        id={storySelect}
        className="storylinks"
        label={t('time.eraForm.stories')}
        hint={t('time.eraForm.storiesHint')}
        error={storyError}
        data-testid="era-stories"
      >
        {(control) => (
          <>
            {stories.length > 0 ? (
              <TokenList>
                {stories.map((story) => (
                  <Token
                    as="li"
                    key={story.id}
                    testId="era-story"
                    note={story.isTrashed ? t('time.eraForm.storyInTrash') : undefined}
                    removeLabel={t('time.eraForm.removeStory', { title: story.title })}
                    onRemove={() =>
                      onChange(
                        stories.filter((one) => one.id !== story.id),
                        scenes.filter((scene) => scene.storyId !== story.id),
                      )
                    }
                  >
                    <bdi>{story.title}</bdi>
                  </Token>
                ))}
              </TokenList>
            ) : null}
            <select
              {...control}
              className="field__input field__input--select"
              value=""
              disabled={available === null || offeredStories.length === 0}
              onChange={(event) => {
                const story = offeredStories.find((one) => one.id === event.target.value)
                if (story)
                  onChange(
                    [...stories, { id: story.id, title: story.title, isTrashed: false }],
                    scenes,
                  )
              }}
              data-testid="era-story-add"
            >
              <option value="">
                {available === null
                  ? t('time.eraForm.readingStories')
                  : available.length === 0
                    ? t('time.eraForm.noStories')
                    : offeredStories.length === 0
                      ? t('time.eraForm.allChosen')
                      : t('time.eraForm.addStory')}
              </option>
              {offeredStories.map((story) => (
                <option key={story.id} value={story.id}>
                  {story.title}
                </option>
              ))}
            </select>
          </>
        )}
      </Field>

      {stories.length > 0 ? (
        <Field
          id={sceneSelect}
          className="storylinks"
          label={t('time.eraForm.scenes')}
          hint={t('time.eraForm.scenesHint')}
          error={sceneError}
          data-testid="era-scenes"
        >
          {(control) => (
            <>
              {scenes.length > 0 ? (
                <TokenList>
                  {scenes.map((scene) => (
                    <Token
                      as="li"
                      key={scene.id}
                      testId="era-scene"
                      note={scene.isTrashed ? t('time.eraForm.sceneInTrash') : undefined}
                      removeLabel={t('time.eraForm.removeScene', { title: scene.title })}
                      onRemove={() =>
                        onChange(
                          stories,
                          scenes.filter((one) => one.id !== scene.id),
                        )
                      }
                    >
                      <bdi>{scene.title}</bdi>
                    </Token>
                  ))}
                </TokenList>
              ) : null}
              <select
                {...control}
                className="field__input field__input--select"
                value=""
                disabled={offeredScenes.length === 0}
                onChange={(event) => {
                  const scene = offeredScenes.find((one) => one.id === event.target.value)
                  if (scene) onChange(stories, [...scenes, scene])
                }}
                data-testid="era-scene-add"
              >
                <option value="">
                  {offeredScenes.length === 0
                    ? t('time.eraForm.noMoreScenes')
                    : t('time.eraForm.addScene')}
                </option>
                {stories.map((story) => {
                  const options = (storyScenes[story.id] ?? []).filter(
                    (scene) => !chosenScenes.has(scene.id),
                  )
                  return options.length === 0 ? null : (
                    <optgroup key={story.id} label={story.title}>
                      {options.map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.title}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </>
          )}
        </Field>
      ) : null}
    </>
  )
}
