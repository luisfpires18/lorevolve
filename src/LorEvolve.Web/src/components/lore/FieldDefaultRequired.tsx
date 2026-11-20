import { CheckField } from '../CheckField'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'

/** A text field's default text, and whether a field is required, with what that asks of the type's entries. */
export function FieldDefaultRequired({
  type,
  field,
  isText,
  isImage,
  defaultValue,
  setDefaultValue,
  isRequired,
  setIsRequired,
  fieldErrors,
}: {
  type: EntityType
  field: FieldDefinition | null
  isText: boolean
  isImage: boolean
  defaultValue: string
  setDefaultValue: (defaultValue: string) => void
  isRequired: boolean
  setIsRequired: (isRequired: boolean) => void
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <>
      {isText ? (
        <Field
          label={t('entityTypes.fields.defaultText')}
          name="field-default"
          dir="auto"
          value={defaultValue}
          onChange={(event) => setDefaultValue(event.target.value)}
          error={fieldErrors.defaultvalue}
          hint={t('entityTypes.fields.defaultHint')}
          data-testid="field-default"
        />
      ) : null}

      {isImage ? null : (
        <CheckField
          label={t('entityTypes.fields.requiredLabel')}
          hint={
            field && isRequired && !field.isRequired
              ? t('entityTypes.fields.requiredHint', { name: type.name })
              : undefined
          }
          checked={isRequired}
          onChange={setIsRequired}
          testId="field-required"
        />
      )}
    </>
  )
}
