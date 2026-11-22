import { useId, useState } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import type { EraScene } from '../progression/types'
import { useUniverseStories } from '../stories/useUniverseStories'
import { sceneChoices, useStoryScenes } from '../stories/useStoryScenes'
import { Token, TokenList } from './Token'

/**
 * Scenes chosen from any story of the universe: a story first, then one of its scenes in reading order. Each chosen scene is a
 * token with Remove; one in the Trash stays chosen and says so, and is never offered. With `single`, choosing replaces.
 */
export function ScenePicks({
  universeId,
  label,
  hint,
  value,
  onChange,
  single = false,
  error,
  testId,
}: {
  universeId: string
  label: string
  hint?: string
  value: EraScene[]
  onChange: (scenes: EraScene[]) => void
  single?: boolean
  error?: string
  testId: string
}) {
  const { t } = useI18n()
  const storyId = useId()
  const sceneId = useId()
  const fieldId = useId()
  const [story, setStory] = useState('')
  // A read that fails offers nothing, as an empty one does.
  const storiesLoad = useUniverseStories(universeId)
  const stories =
    storiesLoad.kind === 'loading' ? null : storiesLoad.kind === 'ready' ? storiesLoad.value : []
  const storyLoad = useStoryScenes(universeId, story)
  const scenes =
    storyLoad.kind === 'loading'
      ? null
      : storyLoad.kind === 'ready'
        ? sceneChoices(storyLoad.value)
        : []

  const chosen = new Set(value.map((scene) => scene.id))
  const offered = (scenes ?? []).filter((scene) => !chosen.has(scene.id))
  const describedBy =
    [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <Field
      label={label}
      id={fieldId}
      group="fieldset"
      className="storylinks scenepicks__group"
      data-testid={testId}
      hint={hint}
      error={error}
    >
      {value.length > 0 ? (
        <TokenList>
          {value.map((scene) => (
            <Token
              as="li"
              key={scene.id}
              testId={`${testId}-chosen`}
              note={
                scene.isTrashed
                  ? t('stories.picks.noteTrashed', { story: scene.storyTitle })
                  : t('stories.picks.note', { story: scene.storyTitle })
              }
              removeLabel={t('stories.picks.remove', { title: scene.title })}
              onRemove={() => onChange(value.filter((one) => one.id !== scene.id))}
            >
              <bdi>{scene.title}</bdi>
            </Token>
          ))}
        </TokenList>
      ) : null}

      <div className="scenepicks">
        <label className="visually-hidden" htmlFor={storyId}>
          {t('stories.picks.storyLabel', { label })}
        </label>
        <select
          id={storyId}
          className="field__input field__input--select"
          value={story}
          onChange={(event) => setStory(event.target.value)}
          aria-describedby={describedBy}
          data-testid={`${testId}-story`}
        >
          <option value="">
            {stories === null
              ? t('stories.picks.readingStories')
              : stories.length === 0
                ? t('stories.picks.noStories')
                : t('stories.picks.chooseStory')}
          </option>
          {(stories ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.title}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor={sceneId}>
          {t('stories.picks.sceneLabel', { label })}
        </label>
        <select
          id={sceneId}
          className="field__input field__input--select"
          value=""
          disabled={!story || offered.length === 0}
          onChange={(event) => {
            const scene = offered.find((one) => one.id === event.target.value)
            if (scene) onChange(single ? [scene] : [...value, scene])
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-testid={`${testId}-scene`}
        >
          <option value="">
            {!story
              ? t('stories.picks.thenScene')
              : scenes === null
                ? t('stories.picks.readingScenes')
                : offered.length === 0
                  ? t('stories.picks.noMoreScenes')
                  : t('stories.picks.chooseScene')}
          </option>
          {offered.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title}
            </option>
          ))}
        </select>
      </div>
    </Field>
  )
}
