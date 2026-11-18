import { useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { beatKey, type BeatDraft } from '../stories/beats'
import { Button } from './Button'
import { IconButton } from './IconButton'

interface SceneBeatsFieldProps {
  beats: BeatDraft[]
  onChange: (beats: BeatDraft[]) => void
  /** The API's refusals, by its own keys: `beats`, `beats[0].title`, `beats[0].note`. */
  errors: Record<string, string>
}

/**
 * A scene's beats in the scene drawer (ADR 0070): its steps in order, each a title and an optional note. Rows are added at
 * the end, moved one place at a time and removed, all from the keyboard as well as the pointer. Saved with the scene, whole.
 */
export function SceneBeatsField({ beats, onChange, errors }: SceneBeatsFieldProps) {
  const { t } = useI18n()
  const list = useRef<HTMLOListElement>(null)

  function focusRow(index: number) {
    requestAnimationFrame(() =>
      list.current
        ?.querySelectorAll<HTMLInputElement>('[data-testid="scene-beat-title"]')
        [index]?.focus(),
    )
  }

  function update(index: number, change: Partial<BeatDraft>) {
    onChange(beats.map((beat, at) => (at === index ? { ...beat, ...change } : beat)))
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by
    if (target < 0 || target >= beats.length) return
    const reordered = [...beats]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    onChange(reordered)
    focusRow(target)
  }

  function remove(index: number) {
    onChange(beats.filter((_, at) => at !== index))
    focusRow(Math.max(0, index - 1))
  }

  function add() {
    onChange([...beats, { key: beatKey(), title: '', note: '' }])
    focusRow(beats.length)
  }

  return (
    <Field
      group="fieldset"
      className="scenebeats"
      label={t('stories.beats.legend')}
      hint={t('stories.beats.hint')}
      error={errors.beats}
      data-testid="scene-beats-field"
    >
      {beats.length > 0 ? (
        <ol className="scenebeats__list" ref={list}>
          {beats.map((beat, index) => {
            const titleError = errors[`beats[${index}].title`]
            const noteError = errors[`beats[${index}].note`]
            return (
              <li className="scenebeats__item" key={beat.key} data-testid="scene-beat-row">
                <span className="scenebeats__number" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="scenebeats__fields">
                  <input
                    className="field__input"
                    type="text"
                    dir="auto"
                    placeholder={t('stories.beats.titlePlaceholder')}
                    aria-label={t('stories.beats.titleLabel', { n: index + 1 })}
                    value={beat.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    aria-invalid={titleError ? true : undefined}
                    data-testid="scene-beat-title"
                  />
                  <input
                    className="field__input scenebeats__note"
                    type="text"
                    dir="auto"
                    placeholder={t('stories.beats.notePlaceholder')}
                    aria-label={t('stories.beats.noteLabel', { n: index + 1 })}
                    value={beat.note}
                    onChange={(event) => update(index, { note: event.target.value })}
                    aria-invalid={noteError ? true : undefined}
                    data-testid="scene-beat-note"
                  />
                  {titleError ? <p className="field__error">{titleError}</p> : null}
                  {noteError ? <p className="field__error">{noteError}</p> : null}
                </div>
                <div className="scenebeats__tools">
                  <IconButton
                    icon={ArrowUp}
                    label={t('stories.beats.moveUp', { n: index + 1 })}
                    title={t('stories.beats.earlier')}
                    onClick={() => move(index, -1)}
                    aria-disabled={index === 0 ? true : undefined}
                    data-testid="scene-beat-up"
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={t('stories.beats.moveDown', { n: index + 1 })}
                    title={t('stories.beats.later')}
                    onClick={() => move(index, 1)}
                    aria-disabled={index === beats.length - 1 ? true : undefined}
                    data-testid="scene-beat-down"
                  />
                  <IconButton
                    icon={X}
                    label={t('stories.beats.removeLabel', { n: index + 1 })}
                    title={t('stories.beats.remove')}
                    onClick={() => remove(index)}
                    data-testid="scene-beat-remove"
                  />
                </div>
              </li>
            )
          })}
        </ol>
      ) : null}

      <Button
        tone="secondary"
        size="sm"
        icon={Plus}
        className="scenebeats__add"
        onClick={add}
        data-testid="scene-beat-add"
      >
        {t('stories.beats.add')}
      </Button>
    </Field>
  )
}
