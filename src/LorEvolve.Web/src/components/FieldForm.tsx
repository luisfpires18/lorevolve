import { useState } from 'react'
import { Field } from './Field'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_IMAGE_SHAPE_ORDER,
  FIELD_KIND_LABELS,
  FieldImageShape,
  type FieldImageShapeValue,
} from '../lore/fieldKinds'
import { FieldKind, type FieldKindValue, type ProjectField } from '../projectEntities/types'
import { PROJECT_FIELD_KINDS } from '../projectEntities/fieldDefinition'
import { CheckField } from './CheckField'
import { t, useI18n } from '../i18n'
import { FormActions } from './FormActions'
import { useDiscardGuard } from '../lib/useDiscardGuard'

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
  const [start] = useState(() => ({ name, kind, options }))
  const { confirmLeave } = useDiscardGuard(
    !busy && (name !== start.name || kind !== start.kind || options !== start.options),
    t(initial ? 'entityTypes.fields.leaveEdited' : 'entityTypes.fields.leaveNew'),
  )
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
      <Field label={t('projects.schema.fieldName')} requiredMark>
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

      <Field
        as="select"
        label={t('projects.schema.fieldKind')}
        value={kind}
        onChange={(event) => setKind(Number(event.target.value) as FieldKindValue)}
        data-testid="project-field-new-kind"
      >
        {PROJECT_FIELD_KINDS.map((each) => (
          <option key={each} value={each}>
            {FIELD_KIND_LABELS[each]}
          </option>
        ))}
      </Field>

      {choosing ? (
        <Field
          as="textarea"
          label={t('projects.schema.fieldOptions')}
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          data-testid="project-field-new-options"
        />
      ) : null}

      {isImage ? (
        <Field
          as="select"
          label={t('projects.schema.imageShape')}
          hint={t('projects.schema.imageShapeHint')}
          value={imageShape}
          onChange={(event) => setImageShape(Number(event.target.value) as FieldImageShapeValue)}
          data-testid="project-field-new-image-shape"
        >
          {FIELD_IMAGE_SHAPE_ORDER.map((each) => (
            <option key={each} value={each}>
              {FIELD_IMAGE_SHAPE_LABELS[each]}
            </option>
          ))}
        </Field>
      ) : (
        <CheckField
          label={<span>{t('projects.schema.fieldRequired')}</span>}
          checked={required}
          onChange={setRequired}
          testId="project-field-new-required"
        />
      )}

      <FormActions
        submitLabel={initial ? t('shell.actions.save') : t('projects.schema.addField')}
        busy={busy}
        busyLabel={initial ? t('projects.schema.fieldSaving') : t('projects.schema.fieldAdding')}
        submitTestId="project-field-new-save"
        onCancel={() => void confirmLeave().then((ok) => ok && onCancel())}
        cancelTestId="project-field-new-cancel"
        inline
      />
    </form>
  )
}

export type { ProjectField }
