import { useEffect, useId, useState } from 'react'
import { getStory, listStories } from '../stories/api'
import { readingOrder } from '../stories/structure'
import type { StorySummary } from '../stories/types'
import type { EraScene } from '../progression/types'

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
  const storyId = useId()
  const sceneId = useId()
  const hintId = useId()
  const errorId = useId()
  const [stories, setStories] = useState<StorySummary[] | null>(null)
  const [story, setStory] = useState('')
  const [scenes, setScenes] = useState<EraScene[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listStories(universeId, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setStories([])
      })
    return () => controller.abort()
  }, [universeId])

  useEffect(() => {
    if (!story) return
    const controller = new AbortController()
    getStory(universeId, story, controller.signal)
      .then((detail) =>
        setScenes(
          readingOrder(detail.chapters, detail.scenes).map((scene) => ({
            id: scene.id,
            storyId: detail.id,
            title: scene.title,
            storyTitle: detail.title,
            isTrashed: false,
          })),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setScenes([])
      })
    return () => controller.abort()
  }, [universeId, story])

  const chosen = new Set(value.map((scene) => scene.id))
  const offered = (scenes ?? []).filter((scene) => !chosen.has(scene.id))
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <fieldset className="field storylinks scenepicks__group" data-testid={testId}>
      <legend className="field__label">{label}</legend>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="storylinks__list">
          {value.map((scene) => (
            <li className="token" key={scene.id} data-testid={`${testId}-chosen`}>
              <bdi>{scene.title}</bdi>
              <span className="token__note">
                {' '}
                · {scene.storyTitle}
                {scene.isTrashed ? ' (in Trash)' : ''}
              </span>
              <button
                type="button"
                className="token__remove"
                aria-label={`Remove ${scene.title}`}
                onClick={() => onChange(value.filter((one) => one.id !== scene.id))}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="scenepicks">
        <label className="visually-hidden" htmlFor={storyId}>
          {label}: story
        </label>
        <select
          id={storyId}
          className="field__input field__input--select"
          value={story}
          onChange={(event) => {
            setScenes(null)
            setStory(event.target.value)
          }}
          aria-describedby={describedBy}
          data-testid={`${testId}-story`}
        >
          <option value="">
            {stories === null
              ? 'Reading stories…'
              : stories.length === 0
                ? 'No stories yet'
                : 'Choose a story…'}
          </option>
          {(stories ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.title}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor={sceneId}>
          {label}: scene
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
              ? 'Then a scene'
              : scenes === null
                ? 'Reading scenes…'
                : offered.length === 0
                  ? 'No more scenes'
                  : 'Choose a scene…'}
          </option>
          {offered.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.title}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
