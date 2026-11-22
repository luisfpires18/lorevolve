import { useI18n } from '../i18n'
import { CheckField } from './CheckField'
import { SectionTitle } from './Section'

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
    <section className="drawer__group" aria-labelledby="type-behaviour">
      <SectionTitle level={3} tone="rule-accent" id="type-behaviour">
        {t('entityTypes.page.dialog.behaviour')}
      </SectionTitle>
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
    </section>
  )
}
