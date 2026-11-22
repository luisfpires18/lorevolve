import { t } from '../../i18n'
import { FamilySemanticSelect } from '../FamilySemanticSelect'
import {
  FAMILY_SEMANTIC_LABELS,
  FAMILY_SEMANTIC_ORDER,
  FAMILY_SEMANTIC_WORDS,
  FamilySemantic,
  isParentSemantic,
} from '../../relationships/types'
import { FAMILY_KEY, type TypeDraft } from '../../relationships/typeDraft'
import { QuietNote } from '../QuietNote'

export function KindFormFamily({
  draft,
  edit,
  fieldErrors,
}: {
  draft: TypeDraft
  edit: (change: Partial<TypeDraft>) => void
  fieldErrors: Record<string, string>
}) {
  return (
    <fieldset className="reltype__canon" data-testid="reltype-family">
      <legend className="reltype__legend">{t('relationships.types.familyLegend')}</legend>
      <QuietNote spacing="flush">{t('relationships.types.familyHint')}</QuietNote>

      {draft.isSymmetric ? (
        <QuietNote spacing="flush" testId="reltype-no-family">
          {t('relationships.types.noFamily')}
        </QuietNote>
      ) : null}

      <FamilySemanticSelect
        label={t('relationships.types.familyMeaning')}
        id="reltype-family-meaning"
        testId="reltype-family-meaning"
        error={fieldErrors[FAMILY_KEY]}
        options={FAMILY_SEMANTIC_ORDER.map((value) => ({
          value,
          label: FAMILY_SEMANTIC_LABELS[value],
        }))}
        value={draft.familySemantic}
        isSymmetric={draft.isSymmetric}
        fallback={FamilySemantic.None}
        onChange={(familySemantic) => edit({ familySemantic })}
      />

      {!draft.isSymmetric && isParentSemantic(draft.familySemantic) ? (
        <p className="reltype__direction" data-testid="reltype-family-direction">
          <span className="reltype__end">{t('relationships.types.source')}</span>
          <span>
            {t('relationships.types.isParent', {
              word: FAMILY_SEMANTIC_WORDS[draft.familySemantic],
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span className="reltype__end">{t('relationships.types.target')}</span>
          <span>{t('relationships.types.isChild')}</span>
        </p>
      ) : null}
      {draft.familySemantic === FamilySemantic.NonStructuralFamily ? (
        <QuietNote spacing="flush" testId="reltype-family-listed">
          {t('relationships.types.familyListedHint')}
        </QuietNote>
      ) : null}
    </fieldset>
  )
}
