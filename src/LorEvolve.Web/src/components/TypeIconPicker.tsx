import { useId } from 'react'
import { Check } from 'lucide-react'
import { TYPE_ICONS } from '../lore/typeIcons'
import { TypeIcon } from './TypeIcon'

/**
 * Chooses an entity type's icon from the built-in set, or none.
 *
 * Radio buttons underneath, drawn as a grid of small choices that each show the picture and say what it is - "Crown",
 * "Castle", "Map pin" - so nothing depends on hovering to find out. One choice from a list is what a radio group is, so
 * the keyboard (arrows within the group), the checked state and what a screen reader says all come from the platform.
 * The chosen one is drawn with an ink edge, heavier words and a check mark, not with colour alone.
 *
 * "No icon" is a real choice and the default. It draws the same neutral shape a type with no icon gets everywhere else,
 * so the author sees exactly what they are choosing. Each picture is named for what it shows, never for a kind of lore.
 */
export function TypeIconPicker({
  value,
  onChange,
  disabled = false,
  testId,
}: {
  value: string | null
  onChange: (key: string | null) => void
  disabled?: boolean
  testId?: string
}) {
  const name = useId()
  const choices = [
    { key: null as string | null, label: 'No icon' },
    ...TYPE_ICONS.map((option) => ({ key: option.key as string | null, label: option.label })),
  ]

  return (
    <fieldset className="iconpicker" disabled={disabled} data-testid={testId}>
      <legend className="field__label">Icon</legend>

      <div className="iconpicker__grid">
        {choices.map((choice) => {
          const checked = value === choice.key
          return (
            <label className="iconpicker__choice" key={choice.key ?? 'none'}>
              <input
                className="iconpicker__input"
                type="radio"
                name={name}
                value={choice.key ?? ''}
                checked={checked}
                onChange={() => onChange(choice.key)}
                data-icon-key={choice.key ?? undefined}
              />
              <TypeIcon iconKey={choice.key} className="iconpicker__glyph" />
              <span className="iconpicker__name">{choice.label}</span>
              {checked ? (
                <Check
                  className="iconpicker__check"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={2.25}
                />
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
