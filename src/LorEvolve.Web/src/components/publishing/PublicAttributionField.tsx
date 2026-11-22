import { useI18n } from '../../i18n'
import { Field } from '../Field'
import { CheckField } from '../CheckField'
import { ORIGINAL_CREATOR_MAX, ORIGINAL_WORK_MAX } from '../../publishing/types'
import type { Attribution } from '../../publishing/publicDetailsDraft'
import { QuietNote } from '../QuietNote'

/** The "based on" attribution field: the box, then whose work and which, when ticked. */
export function PublicAttributionField({
  attribution,
  attribute,
  fieldErrors,
  creatorId,
  creatorHintId,
  workId,
}: {
  attribution: Attribution
  attribute: (change: Partial<Attribution>) => void
  fieldErrors: Record<string, string>
  creatorId: string
  creatorHintId: string
  workId: string
}) {
  const { t } = useI18n()
  return (
    <Field
      label={t('universe.publicDetails.attribution')}
      group="fieldset"
      className="publication__attribution"
      data-testid="public-attribution"
    >
      <CheckField
        label={t('universe.publicDetails.basedOn')}
        checked={attribution.based}
        aria-controls={attribution.based ? creatorId : undefined}
        onChange={(based) => attribute({ based })}
        testId="based-on-external-work"
      />
      {attribution.based ? (
        <div className="publication__attributionfields">
          <Field
            label={t('universe.publicDetails.creator')}
            id={creatorId}
            error={fieldErrors.originalcreator}
            announce
          >
            {(control) => (
              <>
                <input
                  id={control.id}
                  className="field__input"
                  maxLength={ORIGINAL_CREATOR_MAX}
                  value={attribution.creator}
                  aria-required="true"
                  aria-describedby={`${creatorHintId} ${control['aria-describedby'] ?? ''}`.trim()}
                  aria-invalid={control['aria-invalid']}
                  onChange={(event) => attribute({ creator: event.target.value })}
                  data-testid="original-creator"
                />
                <QuietNote spacing="hint" id={creatorHintId}>
                  {t('universe.publicDetails.creatorHint')}
                </QuietNote>
              </>
            )}
          </Field>
          <Field
            label={t('universe.publicDetails.work')}
            id={workId}
            error={fieldErrors.originalwork}
            announce
            name={null}
            maxLength={ORIGINAL_WORK_MAX}
            value={attribution.work}
            onChange={(event) => attribute({ work: event.target.value })}
            data-testid="original-work"
          />
        </div>
      ) : null}
    </Field>
  )
}
