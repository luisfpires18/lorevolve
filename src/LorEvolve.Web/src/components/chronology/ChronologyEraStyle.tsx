import { SegmentedField } from '../SegmentedField'
import { EraDirection, EraLabelPosition } from '../../chronology/types'
import { DIRECTIONS, type EraDraft } from '../../chronology/eraDrafts'
import { t, useI18n } from '../../i18n'

/** A period's direction and position, each choice with its example year. */
export function ChronologyEraStyle({
  era,
  index,
  base,
  label,
  update,
}: {
  era: EraDraft
  index: number
  base: string
  label: string
  update: (index: number, part: Partial<EraDraft>) => void
}) {
  useI18n()
  return (
    <>
      <SegmentedField
        label={t('time.periods.yearsCount')}
        id={`${base}-direction`}
        hint={
          <span className="era__run" data-testid="era-run">
            {era.direction === EraDirection.Descending ? (
              <>
                <span className="era__sequence" aria-hidden="true">
                  … → 3 → 2 → 1
                </span>
                <span className="visually-hidden">{t('time.periods.countDown.spoken')}</span>
                {t('time.periods.countDown.text')}
              </>
            ) : (
              <>
                <span className="era__sequence" aria-hidden="true">
                  1 → 2 → 3 → …
                </span>
                <span className="visually-hidden">{t('time.periods.countUp.spoken')}</span>
                {t('time.periods.countUp.text')}
              </>
            )}
          </span>
        }
        testId="era-direction"
        options={DIRECTIONS.map((option) => ({
          value: option.value,
          label: option.label(),
          testId: option.testId,
        }))}
        value={era.direction}
        onChange={(direction) => update(index, { direction })}
      />

      <SegmentedField
        label={t('time.periods.writeAs')}
        id={`${base}-position`}
        testId="era-position"
        options={[EraLabelPosition.BeforeYear, EraLabelPosition.AfterYear].map((position) => ({
          value: position,
          // A year of 10 written the way a period asks. An example of the format only - never a bound.
          label:
            position === EraLabelPosition.AfterYear ? (
              <>
                10 <bdi>{label}</bdi>
              </>
            ) : (
              <>
                <bdi>{label}</bdi> 10
              </>
            ),
          testId:
            position === EraLabelPosition.AfterYear ? 'era-position-after' : 'era-position-before',
        }))}
        value={era.labelPosition}
        onChange={(position) => update(index, { labelPosition: position })}
      />
    </>
  )
}
