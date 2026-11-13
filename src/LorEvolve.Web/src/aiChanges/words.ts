import { t, tn } from '../i18n'
import {
  AiChangeSource,
  ProposalStatus,
  type ProposalStatusValue,
  type ProposalSummary,
} from './api'

/** Getters, so each word is looked up in the current language when read, never frozen at import. */
export const STATUS_WORDS: Record<ProposalStatusValue, string> = {
  get [ProposalStatus.Open]() {
    return t('review.words.status.open')
  },
  get [ProposalStatus.Approved]() {
    return t('review.words.status.approved')
  },
  get [ProposalStatus.PartiallyApproved]() {
    return t('review.words.status.partlyApproved')
  },
  get [ProposalStatus.Rejected]() {
    return t('review.words.status.rejected')
  },
  get [ProposalStatus.Expired]() {
    return t('review.words.status.expired')
  },
}

/** Where a proposal came from, in a creator's words. The app's name is its own claim, so it is quoted as such. */
export function sourceWords(proposal: ProposalSummary) {
  return proposal.source === AiChangeSource.Assistant
    ? t('review.words.source.assistant')
    : proposal.clientName
      ? t('review.words.source.app', { name: proposal.clientName })
      : t('review.words.source.unnamedApp')
}

/** "3 new, 1 edit, 1 to the Trash". */
export function countWords(proposal: ProposalSummary) {
  const parts = [
    proposal.createCount ? t('review.words.count.created', { n: proposal.createCount }) : null,
    proposal.updateCount
      ? tn('review.words.count.updated', proposal.updateCount, { n: proposal.updateCount })
      : null,
    proposal.removeCount ? t('review.words.count.removed', { n: proposal.removeCount }) : null,
  ].filter(Boolean)
  return parts.join(', ')
}
