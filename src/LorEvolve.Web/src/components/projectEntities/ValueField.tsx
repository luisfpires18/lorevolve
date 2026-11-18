import { Field } from '../Field'
import { FieldKind, type FieldValueInput, type ProjectField } from '../../projectEntities/types'
import { useI18n } from '../../i18n'

/** One field's control, by kind. Every value a save sends fills exactly one member of the input. */
export function ValueField({
  field,
  value,
  onChange,
}: {
  field: ProjectField
  value: FieldValueInput | undefined
  onChange: (next: FieldValueInput) => void
}) {
  useI18n()
  const blank: FieldValueInput = {
    fieldDefinitionId: field.id,
    text: null,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
    eraId: null,
  }
  const current = value ?? blank
  const testId = `project-entry-value-${field.id}`

  if (field.kind === FieldKind.Select || field.kind === FieldKind.MultiSelect) {
    const chosen = current.optionIds ?? []
    return (
      <Field
        label={`${field.name}${field.isRequired ? ' *' : ''}`}
        group="fieldset"
        data-testid={testId}
      >
        <div className="choices">
          {field.options.map((option) => (
            <label key={option.id} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(option.id)}
                data-testid={`${testId}-${option.id}`}
                onChange={(event) =>
                  onChange({
                    ...blank,
                    // One choice replaces, several accumulate: the kind decides, not the control.
                    optionIds: event.target.checked
                      ? field.kind === FieldKind.Select
                        ? [option.id]
                        : [...chosen, option.id]
                      : chosen.filter((id) => id !== option.id),
                  })
                }
              />
              <span>{option.value}</span>
            </label>
          ))}
        </div>
      </Field>
    )
  }

  if (field.kind === FieldKind.Boolean) {
    return (
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={current.boolean === true}
            data-testid={testId}
            onChange={(event) => onChange({ ...blank, boolean: event.target.checked })}
          />
          <span>
            {field.name}
            {field.isRequired ? ' *' : ''}
          </span>
        </label>
      </div>
    )
  }

  return (
    <Field label={`${field.name}${field.isRequired ? ' *' : ''}`}>
      {(control) =>
        field.kind === FieldKind.LongText ? (
          <textarea
            {...control}
            className="field__input"
            value={current.text ?? ''}
            data-testid={testId}
            onChange={(event) => onChange({ ...blank, text: event.target.value })}
          />
        ) : (
          <input
            {...control}
            className="field__input"
            type={
              field.kind === FieldKind.Number
                ? 'number'
                : field.kind === FieldKind.Date
                  ? 'date'
                  : 'text'
            }
            value={
              field.kind === FieldKind.Number
                ? (current.number?.toString() ?? '')
                : field.kind === FieldKind.Date
                  ? (current.date ?? '')
                  : (current.text ?? '')
            }
            data-testid={testId}
            onChange={(event) => {
              const raw = event.target.value
              onChange(
                field.kind === FieldKind.Number
                  ? { ...blank, number: raw.length > 0 ? Number(raw) : null }
                  : field.kind === FieldKind.Date
                    ? { ...blank, date: raw.length > 0 ? raw : null }
                    : { ...blank, text: raw },
              )
            }}
          />
        )
      }
    </Field>
  )
}
