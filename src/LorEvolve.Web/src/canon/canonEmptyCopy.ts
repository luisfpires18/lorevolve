import { CanonConflictStatus, CONFLICT_STATUS_LABELS, SEVERITY_LABELS } from './types'
import type { CanonConflictStatusValue, CanonSeverityValue } from './types'
import { t } from '../i18n'

export function emptyLine(status: CanonConflictStatusValue, severity: CanonSeverityValue | null) {
  if (severity !== null) {
    return t('canon.page.emptyAtSeverity', {
      status: CONFLICT_STATUS_LABELS[status].toLowerCase(),
      severity: SEVERITY_LABELS[severity],
    })
  }

  if (status === CanonConflictStatus.Dismissed) return t('canon.page.emptyDismissed')
  if (status === CanonConflictStatus.Resolved) return t('canon.page.emptyResolved')
  return t('canon.page.emptyPending')
}

export function hint(status: CanonConflictStatusValue) {
  if (status === CanonConflictStatus.Dismissed) {
    return t('canon.page.hintDismissed')
  }

  if (status === CanonConflictStatus.Resolved) {
    return t('canon.page.hintResolved')
  }

  return t('canon.page.hintPending')
}
