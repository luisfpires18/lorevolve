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
    <CanonStatusPicker
      field={{ label: t('places.linkForm.status') }}
      optionTestId="family-link-canon-"
      value={canonStatus}
      onChange={setCanonStatus}
    />
  )
}
