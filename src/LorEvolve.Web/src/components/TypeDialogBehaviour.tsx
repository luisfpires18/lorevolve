import { useI18n } from '../i18n'
import { CheckField } from './CheckField'
import { DrawerSection } from './Section'

/** The type drawer's behaviour section for a new type: whether its entries take part in the Family Tree. */
export function TypeDialogBehaviour({
  familyTreeEligible,
  setFamilyTreeEligible,
}: {
  familyTreeEligible: boolean
  setFamilyTreeEligible: (familyTreeEligible: boolean) => void
}) {
  const { t } = useI18n()
  return (
    <DrawerSection title={t('entityTypes.page.dialog.behaviour')} titleId="type-behaviour">
      <CheckField
        label={
          <span>
            <span className="types__familylabel">{t('entityTypes.page.dialog.familyLabel')}</span>
            {t('entityTypes.page.dialog.familyText')}
          </span>
        }
        checked={familyTreeEligible}
        onChange={setFamilyTreeEligible}
        testId="type-family"
      />
    </DrawerSection>
  )
}
