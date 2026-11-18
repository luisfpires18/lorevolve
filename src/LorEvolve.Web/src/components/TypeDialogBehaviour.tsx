import { useI18n } from '../i18n'

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
      <h3 className="sectionrule sectionrule--accent" id="type-behaviour">
        {t('entityTypes.page.dialog.behaviour')}
      </h3>
      <label className="check">
        <input
          type="checkbox"
          checked={familyTreeEligible}
          onChange={(event) => setFamilyTreeEligible(event.target.checked)}
          data-testid="type-family"
        />
        <span>
          <span className="types__familylabel">{t('entityTypes.page.dialog.familyLabel')}</span>
          {t('entityTypes.page.dialog.familyText')}
        </span>
      </label>
    </section>
  )
}
