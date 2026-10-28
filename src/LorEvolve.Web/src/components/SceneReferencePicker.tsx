import { useId, useState } from 'react'
import { ContainerName } from './ContainerName'
import { containerNumber, UNCHAPTERED } from '../stories/format'
import { readingOrder, scenesIn } from '../stories/structure'
import type { Chapter, Scene } from '../stories/types'

interface SceneReferencePickerProps {
  /** The story's chapters, in order. */
  chapters: Chapter[]
  /** Every scene in the story. */
  scenes: Scene[]
  /** The chosen scenes' ids. */
  value: string[]
  onChange: (sceneIds: string[]) => void
  error?: string
}

/**
 * The scenes a beat plays out in, chosen from its own story.
 *
 * Scenes are grouped the way the story reads - Unchaptered, then chapter by chapter - so a title is always seen with
 * the chapter it sits in, and a filter narrows a long story by title. What is chosen is only ever scene ids: no chapter
 * is recorded, so a scene moved to another chapter later is still the scene chosen here.
 *
 * Plain labelled checkboxes, so a keyboard, a screen reader and a phone all work with no custom widget. The chosen
 * scenes are listed above the filter too, so one the filter hides can still be seen and taken off.
 */
export function SceneReferencePicker({
  chapters,
  scenes,
  value,
  onChange,
  error,
}: SceneReferencePickerProps) {
  const id = useId()
  const [filter, setFilter] = useState('')

  const chosen = new Set(value)
  const hasChapters = chapters.length > 0
  const needle = filter.trim().toLocaleLowerCase()

  const groups = [
    { key: 'unchaptered', label: UNCHAPTERED, scenes: scenesIn(scenes, null) },
    ...chapters.map((chapter, index) => ({
      key: chapter.id,
      label: <ContainerName chapter={{ index, title: chapter.title }} />,
      scenes: scenesIn(scenes, chapter.id),
    })),
  ]
    .map((group) => ({
      ...group,
      scenes: group.scenes.filter(
        (scene) => needle === '' || scene.title.toLocaleLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.scenes.length > 0)

  const chosenScenes = readingOrder(chapters, scenes).filter((scene) => chosen.has(scene.id))

  function toggle(sceneId: string, on: boolean) {
    onChange(on ? [...value, sceneId] : value.filter((candidate) => candidate !== sceneId))
  }

  return (
    <fieldset className="scenepick" aria-describedby={`${id}-hint`} data-testid="scene-picker">
      <legend className="field__label">Linked scenes</legend>
      <p className="field__hint" id={`${id}-hint`}>
        Where this beat plays out. Linking moves no scene.
      </p>

      {chosenScenes.length > 0 ? (
        <ul
          className="tokens scenepick__chosen"
          aria-label="Chosen scenes"
          data-testid="scene-picker-chosen"
        >
          {chosenScenes.map((scene) => (
            <li className="token" key={scene.id}>
              <span className="token__text">{scene.title}</span>
              {hasChapters ? (
                <span className="token__note">{containerNumber(chapters, scene.chapterId)}</span>
              ) : null}
              <button
                type="button"
                className="token__remove"
                aria-label={`Remove ${scene.title}`}
                onClick={() => toggle(scene.id, false)}
                data-testid="scene-picker-remove"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {scenes.length === 0 ? (
        <p className="scenepick__none">This story has no scenes yet. A beat can wait for one.</p>
      ) : (
        <>
          <input
            className="field__input scenepick__filter"
            type="search"
            placeholder="Filter scenes by title"
            aria-label="Filter scenes by title"
            aria-controls={`${id}-list`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            data-testid="scene-picker-filter"
          />

          <div className="scenepick__list" id={`${id}-list`}>
            {groups.map((group) => (
              <div
                className="scenepick__group"
                role="group"
                aria-labelledby={hasChapters ? `${id}-${group.key}` : undefined}
                key={group.key}
              >
                {hasChapters ? (
                  <p className="scenepick__heading" id={`${id}-${group.key}`}>
                    {group.label}
                  </p>
                ) : null}
                <ul className="scenepick__options">
                  {group.scenes.map((scene) => (
                    <li key={scene.id}>
                      <label className="scenepick__option">
                        <input
                          type="checkbox"
                          checked={chosen.has(scene.id)}
                          onChange={(event) => toggle(scene.id, event.target.checked)}
                          data-testid="scene-picker-option"
                          data-title={scene.title}
                        />
                        <span>{scene.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {groups.length === 0 ? (
              <p className="scenepick__none">No scene has that in its title.</p>
            ) : null}
          </div>
        </>
      )}

      {error ? <p className="field__error">{error}</p> : null}
    </fieldset>
  )
}
