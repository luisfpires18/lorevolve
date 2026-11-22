import { t } from '../../i18n'
import { Field } from '../Field'
import { AgeOrder, type AgeOrderValue } from '../../relationships/types'
import { MAX_KEY, MIN_KEY, type TypeDraft } from '../../relationships/typeDraft'
import { QuietNote } from '../QuietNote'

export function KindFormCanon({
  draft,
  edit,
  fieldErrors,
  orderError,
}: {
  draft: TypeDraft
  edit: (change: Partial<TypeDraft>) => void
  fieldErrors: Record<string, string>
  orderError: string | undefined
}) {
  return (
    <fieldset className="reltype__canon" data-testid="reltype-canon">
      <legend className="reltype__legend">{t('relationships.types.canonLegend')}</legend>
      <QuietNote spacing="flush">{t('relationships.types.canonHint')}</QuietNote>

      <p className="reltype__direction" data-testid="reltype-direction">
        <span className="reltype__end">{t('relationships.types.source')}</span>
        <span aria-hidden="true">→</span>
        <span>{draft.name.trim() || t('relationships.types.readsAsFallback')}</span>
        <span aria-hidden="true">→</span>
        <span className="reltype__end">{t('relationships.types.target')}</span>
      </p>

      {draft.isSymmetric ? (
        <QuietNote spacing="flush" testId="reltype-no-order">
          {t('relationships.types.noOrder')}
        </QuietNote>
      ) : (
        <Field
          as="select"
          label={t('relationships.types.ageOrdering')}
          id="reltype-age-order"
          error={orderError}
          value={draft.ageOrder}
          onChange={(event) => edit({ ageOrder: Number(event.target.value) as AgeOrderValue })}
          data-testid="reltype-age-order"
        >
          <option value={AgeOrder.None}>{t('relationships.types.noAgeRule')}</option>
          <option value={AgeOrder.SourceOlder}>{t('relationships.types.sourceMustBeOlder')}</option>
          <option value={AgeOrder.SourceYounger}>
            {t('relationships.types.sourceMustBeYounger')}
          </option>
        </Field>
      )}

      <div className="reltype__gaps">
        <Field
          label={t('relationships.types.minGap')}
          name="reltype-min-gap"
          inputMode="numeric"
          placeholder={t('relationships.types.gapNone')}
          value={draft.minGap}
          onChange={(event) => edit({ minGap: event.target.value })}
          error={fieldErrors[MIN_KEY]}
          data-testid="reltype-min-gap"
        />
        <Field
          label={t('relationships.types.maxGap')}
          name="reltype-max-gap"
          inputMode="numeric"
          placeholder={t('relationships.types.gapNone')}
          value={draft.maxGap}
          onChange={(event) => edit({ maxGap: event.target.value })}
          error={fieldErrors[MAX_KEY]}
          data-testid="reltype-max-gap"
        />
      </div>
    </fieldset>
  )
}
