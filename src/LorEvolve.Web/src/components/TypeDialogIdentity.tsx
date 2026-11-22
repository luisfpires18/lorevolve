import { Field } from './Field'
import { TypeIconPicker } from './TypeIconPicker'
import { useI18n } from '../i18n'
import type { DialogType } from './TypeDialog'
import { DrawerSection } from './Section'

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
    <DrawerSection title={t('entityTypes.page.dialog.identity')} titleId="type-identity">
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

      <TypeIconPicker
        value={icon}
        onChange={setIcon}
        testId="type-icon"
        hint={iconHint ?? t('entityTypes.page.dialog.iconHint')}
        error={fieldErrors.icon}
      />
    </DrawerSection>
  )
}
