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
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
              data-testid="field-required"
            />
            <span>{t('entityTypes.fields.requiredLabel')}</span>
          </label>
          {field && isRequired && !field.isRequired ? (
            <p className="field__hint">
              {t('entityTypes.fields.requiredHint', { name: type.name })}
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}
