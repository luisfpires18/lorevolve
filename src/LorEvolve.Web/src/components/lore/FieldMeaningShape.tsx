import { Field } from '../Field'
import { useI18n } from '../../i18n'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FIELD_IMAGE_SHAPE_ORDER,
  FIELD_SEMANTIC_LABELS,
  semanticsFor,
  type FieldImageShapeValue,
  type FieldKindValue,
  type FieldSemanticValue,
} from '../../lore/fieldKinds'

/** A field's Canon meaning, for a kind that can carry one, and an Image field's shape. */
export function FieldMeaningShape({
  kind,
  semantic,
  setSemantic,
  isImage,
  imageShape,
  setImageShape,
  fieldErrors,
}: {
  kind: FieldKindValue
  semantic: FieldSemanticValue | null
  setSemantic: (semantic: FieldSemanticValue | null) => void
  isImage: boolean
  imageShape: FieldImageShapeValue
  setImageShape: (imageShape: FieldImageShapeValue) => void
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <>
      {semanticsFor(kind).length > 0 ? (
        <Field
          label={t('entityTypes.fields.canonMeaningLabel')}
          id="field-semantic"
          hint={t('entityTypes.fields.semanticHint')}
          error={fieldErrors.semantic}
        >
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={semantic ?? ''}
              onChange={(event) =>
                setSemantic(
                  event.target.value === ''
                    ? null
                    : (Number(event.target.value) as FieldSemanticValue),
                )
              }
              data-testid="field-semantic"
            >
              <option value="">{t('entityTypes.fields.none')}</option>
              {semanticsFor(kind).map((each) => (
                <option key={each} value={each}>
                  {FIELD_SEMANTIC_LABELS[each]}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {isImage ? (
        <Field
          label={t('entityTypes.fields.imageShape')}
          id="field-image-shape"
          hint={t('entityTypes.fields.imageShapeHint')}
        >
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={imageShape}
              onChange={(event) =>
                setImageShape(Number(event.target.value) as FieldImageShapeValue)
              }
              data-testid="field-image-shape"
            >
              {FIELD_IMAGE_SHAPE_ORDER.map((each) => (
                <option key={each} value={each}>
                  {FIELD_IMAGE_SHAPE_LABELS[each]}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </>
  )
}
