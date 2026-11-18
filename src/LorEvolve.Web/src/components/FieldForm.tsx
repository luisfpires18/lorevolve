import { useState } from 'react'
import { Field } from './Field'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_IMAGE_SHAPE_ORDER,
  FieldImageShape,
  type FieldImageShapeValue,
} from '../lore/fieldKinds'
import { FieldKind, type FieldKindValue, type ProjectField } from '../projectEntities/types'
import { t, useI18n } from '../i18n'
import { FormActions } from './FormActions'

/** The kinds an author can choose in this screen. EntityReference is not among them: a link field needs a target. */
const KINDS: readonly { kind: FieldKindValue; label: () => string }[] = [
  { kind: FieldKind.ShortText, label: () => t('projects.schema.kind.shortText') },
  { kind: FieldKind.LongText, label: () => t('projects.schema.kind.longText') },
  { kind: FieldKind.Number, label: () => t('projects.schema.kind.number') },
  { kind: FieldKind.Boolean, label: () => t('projects.schema.kind.boolean') },
  { kind: FieldKind.Date, label: () => t('projects.schema.kind.date') },
  { kind: FieldKind.Select, label: () => t('projects.schema.kind.select') },
  { kind: FieldKind.MultiSelect, label: () => t('projects.schema.kind.multiSelect') },
  { kind: FieldKind.Image, label: () => t('projects.schema.kind.image') },
]

export function kindLabel(kind: FieldKindValue) {
  return KINDS.find((each) => each.kind === kind)?.label() ?? ''
}

/** The form that adds one field. Choices are asked for only by the two kinds that have them. */
export function FieldForm({
  busy,
  initial,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  /** An existing field to edit: the form then starts from it and saves as an edit. */
  initial?: ProjectField
  onSubmit: (input: {
    name: string
    kind: FieldKindValue
    isRequired: boolean | null
    options: string[] | null
    imageShape: FieldImageShapeValue | null
  }) => void
  onCancel: () => void
}) {
  useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<FieldKindValue>(initial?.kind ?? FieldKind.ShortText)
  const [options, setOptions] = useState(
    initial?.options.map((each) => each.value).join('\n') ?? '',
  )
  const [required, setRequired] = useState(initial?.isRequired ?? false)
  const [imageShape, setImageShape] = useState<FieldImageShapeValue>(
    initial?.imageShape ?? FieldImageShape.Free,
  )
  const isImage = kind === FieldKind.Image
  const choosing = kind === FieldKind.Select || kind === FieldKind.MultiSelect

  return (
    <form
      className="form"
      data-testid="project-field-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit({
          name,
          kind,
          // A picture is optional by nature: the API refuses a required Image field.
          isRequired: isImage ? false : required,
          imageShape: isImage ? imageShape : null,
          options: choosing
            ? options
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
            : null,
        })
      }}
    >
      <Field label={t('projects.schema.fieldName')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="project-field-new-name"
            required
          />
        )}
      </Field>

      <Field label={t('projects.schema.fieldKind')}>
        {(control) => (
          <select
            {...control}
            className="field__input"
            value={kind}
            onChange={(event) => setKind(Number(event.target.value) as FieldKindValue)}
            data-testid="project-field-new-kind"
          >
            {KINDS.map((each) => (
              <option key={each.kind} value={each.kind}>
                {each.label()}
              </option>
            ))}
          </select>
        )}
      </Field>

      {choosing ? (
        <Field label={t('projects.schema.fieldOptions')}>
          {(control) => (
            <textarea
              {...control}
              className="field__input"
              value={options}
              onChange={(event) => setOptions(event.target.value)}
              data-testid="project-field-new-options"
            />
          )}
        </Field>
      ) : null}

      {isImage ? (
        <Field label={t('projects.schema.imageShape')} hint={t('projects.schema.imageShapeHint')}>
          {(control) => (
            <select
              {...control}
              className="field__input"
              value={imageShape}
              onChange={(event) =>
                setImageShape(Number(event.target.value) as FieldImageShapeValue)
              }
              data-testid="project-field-new-image-shape"
            >
              {FIELD_IMAGE_SHAPE_ORDER.map((each) => (
                <option key={each} value={each}>
                  {FIELD_IMAGE_SHAPE_LABELS[each]}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : (
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
              data-testid="project-field-new-required"
            />
            <span>{t('projects.schema.fieldRequired')}</span>
          </label>
        </div>
      )}

      <FormActions
        submitLabel={initial ? t('projects.schema.saveField') : t('projects.schema.addField')}
        busy={busy}
        busyLabel={t('projects.schema.fieldSaving')}
        submitTestId="project-field-new-save"
        onCancel={onCancel}
        cancelTestId="project-field-new-cancel"
        inline
      />
    </form>
  )
}

export type { ProjectField }
