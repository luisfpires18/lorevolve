import { Field } from '../Field'
import { usageOf, type EraDraft } from '../../chronology/eraDrafts'
import { t, useI18n } from '../../i18n'
import { ChronologyEraStyle } from './ChronologyEraStyle'
import { Button } from '../Button'
import { MoveItems } from '../MoveItems'
import { QuietNote } from '../QuietNote'

/** One date period: its name and label, direction and position, and the foot with Earlier, Later and Remove. */
export function ChronologyEraRow({
  era,
  index,
  drafts,
  fieldErrors,
  update,
  move,
  change,
}: {
  era: EraDraft
  index: number
  drafts: EraDraft[]
  fieldErrors: Record<string, string>
  update: (index: number, part: Partial<EraDraft>) => void
  move: (index: number, by: -1 | 1) => void
  change: (next: EraDraft[]) => void
}) {
  useI18n()
  const prefix = `eras[${index}]`
  const base = `era-${era.key}`
  const name = era.name.trim() || t('time.periods.newLower')
  const label = era.abbreviation.trim() || era.name.trim() || t('time.periods.labelDefault')
  const usage = usageOf(era)
  const inUse = usage !== null
  const first = index === 0
  const last = index === drafts.length - 1

  return (
    <li className="era" data-testid="era">
      <span className="era__ordinal" aria-hidden="true">
        {index + 1}
      </span>

      <div className="era__body">
        <div className="era__fields">
          <Field
            label={t('time.periods.name')}
            id={`${base}-name`}
            error={fieldErrors[`${prefix}.name`]}
          >
            {(control) => (
              <input
                {...control}
                className="field__input"
                placeholder={t('time.periods.namePlaceholder')}
                autoComplete="off"
                value={era.name}
                onChange={(event) => update(index, { name: event.target.value })}
                data-testid="era-name"
              />
            )}
          </Field>

          {/* The hint shows only while empty: once there is a label, Write dates as shows it in use. */}
          <Field
            label={t('time.periods.shortLabel')}
            id={`${base}-abbreviation`}
            hint={era.abbreviation.trim() ? undefined : t('time.periods.abbreviationHint')}
            error={fieldErrors[`${prefix}.abbreviation`]}
          >
            {(control) => (
              <input
                {...control}
                className="field__input"
                placeholder={t('time.periods.abbreviationPlaceholder')}
                autoComplete="off"
                value={era.abbreviation}
                onChange={(event) => update(index, { abbreviation: event.target.value })}
                data-testid="era-abbreviation"
              />
            )}
          </Field>

          <ChronologyEraStyle era={era} index={index} base={base} label={label} update={update} />
        </div>

        <div className="era__foot">
          <QuietNote className="era__use" id={`${base}-use`}>
            {usage ?? (era.id ? t('time.periods.nothingDated') : t('time.periods.notSaved'))}
          </QuietNote>
          <div className="era__tools">
            <MoveItems
              look="labelled"
              wording="earlier-later"
              name={name}
              first={first}
              last={last}
              testIds={{ up: 'era-earlier', down: 'era-later' }}
              onMove={(step) => move(index, step)}
            />
            <Button
              tone="danger-quiet"
              size="sm"
              onClick={() => {
                if (!inUse) change(drafts.filter((_, position) => position !== index))
              }}
              aria-disabled={inUse ? true : undefined}
              aria-describedby={inUse ? `${base}-use ${base}-keep` : undefined}
              title={inUse ? t('time.periods.inUseTitle') : undefined}
              aria-label={t('time.periods.removeNamed', { name })}
              data-testid="era-remove"
            >
              {t('time.periods.remove')}
            </Button>
            {inUse ? (
              <span className="visually-hidden" id={`${base}-keep`}>
                {t('time.periods.inUseHidden')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}
