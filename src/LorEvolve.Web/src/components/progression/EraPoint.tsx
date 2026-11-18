import {
  ChronologyPointFields,
  type ChronologyPointDraft,
  type ChronologyPointPart,
} from '../ChronologyPointFields'
import type { Chronology } from '../../chronology/types'
import { t, useI18n } from '../../i18n'

export function EraPoint({
  label,
  prefix,
  errorKey,
  chronology,
  value,
  fieldErrors,
  onChange,
}: {
  label: string
  prefix: string
  errorKey: string
  chronology: Chronology
  value: ChronologyPointDraft
  fieldErrors: Record<string, string>
  onChange: (next: ChronologyPointDraft) => void
}) {
  useI18n()
  const error = (part: string) => fieldErrors[`${errorKey}.${part}`.toLowerCase()]

  return (
    <fieldset className="erapoint" data-testid={prefix}>
      <legend className="erapoint__label">{label}</legend>
      <ChronologyPointFields
        chronology={chronology}
        ids={{
          eraId: `${prefix}-eraId`,
          year: `${prefix}-year`,
          month: `${prefix}-month`,
          day: `${prefix}-day`,
        }}
        eraLabel={t('time.eraForm.pointEra', { label })}
        yearLabel={t('time.eraForm.pointYear', { label })}
        value={value}
        onChange={(part: ChronologyPointPart, next: string) => onChange({ ...value, [part]: next })}
        errors={{
          eraId: error('eraId'),
          year: error('year'),
          month: error('month'),
          day: error('day'),
        }}
      />
    </fieldset>
  )
}
