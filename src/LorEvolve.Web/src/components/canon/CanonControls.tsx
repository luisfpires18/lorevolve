import {
  CanonConflictStatus,
  CONFLICT_STATUS_LABELS,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../../canon/types'
import type { CanonConflictStatusValue, CanonSeverityValue } from '../../canon/types'
import { t } from '../../i18n'
import { Field } from '../Field'
import { SegmentedControl } from '../SegmentedControl'
import type { useCanonConflicts } from '../../canon/useCanonConflicts'
import { QuietNote } from '../QuietNote'

/**
 * The status filters, in the order an author works through them. `null` is deliberately
 * not offered as "Any": the three states mean different things and mixing them puts a
 * closed finding next to a live one with nothing but a chip to tell them apart.
 */
const STATUS_TABS: CanonConflictStatusValue[] = [
  CanonConflictStatus.Pending,
  CanonConflictStatus.Dismissed,
  CanonConflictStatus.Resolved,
]

/** The Canon page's filters: the status buttons and the severity select. Changing either goes back to page 1. */
export function CanonControls({
  status,
  setStatus,
  severity,
  setSeverity,
  setPage,
}: Pick<
  ReturnType<typeof useCanonConflicts>,
  'status' | 'setStatus' | 'severity' | 'setSeverity' | 'setPage'
>) {
  return (
    <div className="controls">
      <div className="controls__filters">
        <SegmentedControl
          label={t('canon.page.statusGroup')}
          options={STATUS_TABS.map((option) => ({
            value: option,
            label: CONFLICT_STATUS_LABELS[option],
            testId: `canon-status-${option}`,
          }))}
          value={status}
          onChange={(option) => {
            setStatus(option)
            setPage(1)
          }}
        />

        <Field label={t('canon.page.severity')} id="canon-severity">
          {(control) => (
            <>
              <select
                id={control.id}
                className="field__input field__input--select"
                value={severity ?? ''}
                onChange={(event) => {
                  setSeverity(
                    event.target.value === ''
                      ? null
                      : (Number(event.target.value) as CanonSeverityValue),
                  )
                  setPage(1)
                }}
                data-testid="canon-severity"
              >
                <option value="">{t('canon.page.anySeverity')}</option>
                {SEVERITY_ORDER.map((option) => (
                  <option key={option} value={option}>
                    {SEVERITY_LABELS[option]}
                  </option>
                ))}
              </select>
              {severity !== null ? (
                <QuietNote spacing="hint">{SEVERITY_HINTS[severity]}</QuietNote>
              ) : null}
            </>
          )}
        </Field>
      </div>
    </div>
  )
}
