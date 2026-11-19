import { Field } from '../Field'
import { CanonStatusPicker } from '../CanonStatusPicker'
import type { CanonStatusValue } from '../../lore/types'
import { useI18n } from '../../i18n'

export function FamilyLinkStatus({
  canonStatus,
  setCanonStatus,
}: {
  canonStatus: CanonStatusValue
  setCanonStatus: (canonStatus: CanonStatusValue) => void
}) {
  const { t } = useI18n()

  return (
    <Field label={t('places.linkForm.status')} group>
      {(control) => (
        <CanonStatusPicker
          {...control}
          optionTestId="family-link-canon-"
          value={canonStatus}
          onChange={setCanonStatus}
        />
      )}
    </Field>
  )
}
