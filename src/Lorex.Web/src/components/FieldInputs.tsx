import { useState } from 'react'
import { namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { FieldKind, isYearMeaning, type FieldDefinition, type FieldValueInput } from '../lore/types'
import { EntityPicker, type EntityChoice, type QuickCreateOptions } from './EntityPicker'

interface FieldInputProps {
  definition: FieldDefinition
  value: FieldValueInput

  /** The universe a link field searches. */
  universeId: string

  /** Never offered to a link field: the entry being edited. */
  excludeId?: string

  /**
   * The entry this field held when the form opened, with its name - "(in Trash)" when it is there, since the listing never
   * offers one. Shown as the choice until it is changed, so a save that touches another field keeps the link as it was.
   */
  heldReference?: EntityChoice | null

  /** How the universe keeps time, for a number that is a year in one of its date periods (eras). */
  chronology: Chronology
  onChange: (next: FieldValueInput) => void

  /** A link field offers Quick Create with this (Issue #25): the entry form, for someone who may create Lore. */
  quickCreate?: QuickCreateOptions | null
}

/** Renders the one control the field's kind calls for. */
export function FieldInput({
  definition,
  value,
  universeId,
  excludeId,
  heldReference,
  chronology,
  onChange,
  quickCreate = null,
}: FieldInputProps) {
  const id = `field-${definition.id}`
  const label = definition.isRequired ? `${definition.name} (required)` : definition.name

  // A link chosen in this form, kept for its name: the value itself is only an id.
  const [chosen, setChosen] = useState<EntityChoice | null>(null)

  // A birth or death year on a universe with date periods is written in one of them, and so is any
  // number that already carries one - showing it keeps a save from quietly dropping it.
  const yearMeaning = isYearMeaning(definition.semantic)
  const showsEra = namesEras(chronology) && (yearMeaning || value.eraId !== null)

  function patch(part: Partial<FieldValueInput>) {
    onChange({ ...value, ...part })
  }

  const numberInput = (
    <input
      id={id}
      type="number"
      className="field__input"
      min={showsEra && value.eraId ? 1 : undefined}
      step={showsEra && value.eraId ? 1 : undefined}
      value={value.number ?? ''}
      onChange={(event) =>
        patch({ number: event.target.value === '' ? null : Number(event.target.value) })
      }
    />
  )

  // A link is searched for rather than listed, and only among the entries the field allows: exactly its allowed type, or
  // any type when it has none. The API decides what is offered and checks what is saved.
  if (definition.kind === FieldKind.EntityReference) {
    const held = value.referencedEntityId
      ? chosen?.id === value.referencedEntityId
        ? chosen
        : heldReference?.id === value.referencedEntityId
          ? heldReference
          : { id: value.referencedEntityId, name: 'Unavailable' }
      : null

    return (
      <EntityPicker
        label={label}
        universeId={universeId}
        value={held}
        onChange={(next) => {
          setChosen(next)
          patch({ referencedEntityId: next?.id ?? null })
        }}
        excludeId={excludeId}
        entityTypeId={definition.targetEntityTypeId}
        entityTypeGroupId={definition.targetGroupId}
        placeholder="Search for an entry"
        quickCreate={quickCreate}
      />
    )
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      {definition.kind === FieldKind.ShortText ? (
        <input
          id={id}
          className="field__input"
          value={value.text ?? ''}
          onChange={(event) => patch({ text: event.target.value })}
        />
      ) : null}

      {definition.kind === FieldKind.LongText ? (
        <textarea
          id={id}
          className="field__input field__input--area"
          rows={3}
          value={value.text ?? ''}
          onChange={(event) => patch({ text: event.target.value })}
        />
      ) : null}

      {definition.kind === FieldKind.Number ? (
        showsEra ? (
          <div className="fieldera">
            <select
              className="field__input field__input--select"
              aria-label={`${definition.name}: date period`}
              value={value.eraId ?? ''}
              onChange={(event) => patch({ eraId: event.target.value || null })}
              data-testid={`field-era-${definition.id}`}
            >
              <option value="">{yearMeaning ? 'Choose a date period' : 'No date period'}</option>
              {chronology.eras.map((era) => (
                <option key={era.id} value={era.id}>
                  {era.abbreviation ? `${era.name} (${era.abbreviation})` : era.name}
                </option>
              ))}
            </select>
            {numberInput}
          </div>
        ) : (
          numberInput
        )
      ) : null}

      {definition.kind === FieldKind.Boolean ? (
        <label className="check">
          <input
            id={id}
            type="checkbox"
            checked={value.boolean ?? false}
            onChange={(event) => patch({ boolean: event.target.checked })}
          />
          <span>Yes</span>
        </label>
      ) : null}

      {definition.kind === FieldKind.Date ? (
        <input
          id={id}
          type="date"
          className="field__input"
          value={value.date ? value.date.slice(0, 10) : ''}
          onChange={(event) =>
            patch({ date: event.target.value ? `${event.target.value}T00:00:00Z` : null })
          }
        />
      ) : null}

      {definition.kind === FieldKind.Select ? (
        <select
          id={id}
          className="field__input field__input--select"
          value={value.optionIds?.[0] ?? ''}
          onChange={(event) => patch({ optionIds: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">Not set</option>
          {definition.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.value}
            </option>
          ))}
        </select>
      ) : null}

      {definition.kind === FieldKind.MultiSelect ? (
        <div className="choices" id={id}>
          {definition.options.map((option) => {
            const chosen = value.optionIds?.includes(option.id) ?? false
            return (
              <label className="check" key={option.id}>
                <input
                  type="checkbox"
                  checked={chosen}
                  onChange={(event) => {
                    const current = value.optionIds ?? []
                    patch({
                      optionIds: event.target.checked
                        ? [...current, option.id]
                        : current.filter((candidate) => candidate !== option.id),
                    })
                  }}
                />
                <span>{option.value}</span>
              </label>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
