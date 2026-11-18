import { Field } from './Field'
import { TypeIconPicker } from './TypeIconPicker'
import { useI18n } from '../i18n'
import type { DialogType } from './TypeDialog'

/** The type drawer's identity section: the type's name and its icon. */
export function TypeDialogIdentity({
  type,
  nameHint,
  iconHint,
  name,
  setName,
  icon,
  setIcon,
  fieldErrors,
}: {
  type: DialogType | null
  nameHint?: string
  iconHint?: string
  name: string
  setName: (name: string) => void
  icon: string | null
  setIcon: (icon: string | null) => void
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <section className="drawer__group" aria-labelledby="type-identity">
      <h3 className="sectionrule sectionrule--accent" id="type-identity">
        {t('entityTypes.page.dialog.identity')}
      </h3>
      <Field
        label={t('entityTypes.page.dialog.name')}
        name="type-name"
        placeholder={type ? undefined : t('entityTypes.page.dialog.namePlaceholder')}
        dir="auto"
        hint={nameHint}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        data-testid="type-name"
      />

      <div className="field">
        <TypeIconPicker value={icon} onChange={setIcon} testId="type-icon" />
        <p className="field__hint">{iconHint ?? t('entityTypes.page.dialog.iconHint')}</p>
        {fieldErrors.icon ? <p className="field__error">{fieldErrors.icon}</p> : null}
      </div>
    </section>
  )
}
