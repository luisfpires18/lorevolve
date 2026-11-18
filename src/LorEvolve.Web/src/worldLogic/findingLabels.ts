import { t } from '../i18n'
import type {
  WorldLogicFindingOutcome,
  WorldLogicFindingRow,
  WorldLogicFindingStatus,
} from './types'

/** What the outcome means, in a word. Never a severity number: the three outcomes are three different facts. */
export function outcomeLabel(outcome: WorldLogicFindingOutcome) {
  if (outcome === 'violation') return t('canon.worldLogic.integrity.outcomes.violation')
  if (outcome === 'error') return t('canon.worldLogic.integrity.outcomes.error')
  return t('canon.worldLogic.integrity.outcomes.unknown')
}

/** A rule finding is titled by its rule; a machine finding by its System and state, or as a value with no state. */
export function findingTitle(finding: WorldLogicFindingRow) {
  const { machine } = finding
  if (!machine) return finding.ruleTitle
  return machine.stateName === null
    ? t('canon.worldLogic.integrity.machine.undeclaredTitle', { system: machine.systemName })
    : t('canon.worldLogic.integrity.machine.title', {
        system: machine.systemName,
        state: machine.stateName,
      })
}

export function outcomeHint(outcome: WorldLogicFindingOutcome) {
  if (outcome === 'violation') return t('canon.worldLogic.integrity.outcomeHints.violation')
  if (outcome === 'error') return t('canon.worldLogic.integrity.outcomeHints.error')
  return t('canon.worldLogic.integrity.outcomeHints.unknown')
}

export function statusLabel(status: WorldLogicFindingStatus) {
  if (status === 'reviewing') return t('canon.worldLogic.integrity.statuses.reviewing')
  if (status === 'resolved') return t('canon.worldLogic.integrity.statuses.resolved')
  if (status === 'dismissed') return t('canon.worldLogic.integrity.statuses.dismissed')
  return t('canon.worldLogic.integrity.statuses.open')
}

/**
 * What one history entry was, in the reader's language. An action the server adds later has no wording here yet, so
 * it is shown as the server's own word rather than dropped: a history that hides an entry is not a history.
 */
export function historyLabel(action: string) {
  switch (action) {
    case 'detected':
      return t('canon.worldLogic.integrity.actions.detected')
    case 'reopened':
      return t('canon.worldLogic.integrity.actions.reopened')
    case 'reviewed':
      return t('canon.worldLogic.integrity.actions.reviewed')
    case 'dismissed':
      return t('canon.worldLogic.integrity.actions.dismissed')
    case 'resolved':
      return t('canon.worldLogic.integrity.actions.resolved')
    case 'closed':
      return t('canon.worldLogic.integrity.actions.closed')
    default:
      return action
  }
}
