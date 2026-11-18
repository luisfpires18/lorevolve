import { Field } from '../Field'
import { EraDirection, EraLabelPosition } from '../../chronology/types'
import { DIRECTIONS, type EraDraft } from '../../chronology/eraDrafts'
import { t, useI18n } from '../../i18n'
import { ExampleYear } from './ExampleYear'

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
      <Field
        label={t('time.periods.yearsCount')}
        id={`${base}-direction`}
        group
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
      >
        {(control) => (
          <div className="segmented" {...control} data-testid="era-direction">
            {DIRECTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className="segmented__option"
                aria-pressed={era.direction === option.value}
                onClick={() => update(index, { direction: option.value })}
                data-testid={option.testId}
              >
                {option.label()}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label={t('time.periods.writeAs')} id={`${base}-position`} group>
        {(control) => (
          <div className="segmented" {...control} data-testid="era-position">
            {[EraLabelPosition.BeforeYear, EraLabelPosition.AfterYear].map((position) => (
              <button
                key={position}
                type="button"
                className="segmented__option"
                aria-pressed={era.labelPosition === position}
                onClick={() => update(index, { labelPosition: position })}
                data-testid={
                  position === EraLabelPosition.AfterYear
                    ? 'era-position-after'
                    : 'era-position-before'
                }
              >
                <ExampleYear label={label} position={position} />
              </button>
            ))}
          </div>
        )}
      </Field>
    </>
  )
}
