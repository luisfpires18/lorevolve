import {
  AiChangeSource,
  ProposalStatus,
  type ProposalStatusValue,
  type ProposalSummary,
} from './api'

export const STATUS_WORDS: Record<ProposalStatusValue, string> = {
  [ProposalStatus.Open]: 'Waiting for review',
  [ProposalStatus.Approved]: 'Approved',
  [ProposalStatus.PartiallyApproved]: 'Partly approved',
  [ProposalStatus.Rejected]: 'Rejected',
  [ProposalStatus.Expired]: 'Expired',
}

/** Where a proposal came from, in a creator's words. The app's name is its own claim, so it is quoted as such. */
export function sourceWords(proposal: ProposalSummary) {
  return proposal.source === AiChangeSource.Assistant
    ? 'LoreX Assistant'
    : proposal.clientName
      ? `${proposal.clientName} (connected app)`
      : 'A connected app'
}

/** "3 new, 1 edit, 1 to the Trash". */
export function countWords(proposal: ProposalSummary) {
  const parts = [
    proposal.createCount ? `${proposal.createCount} new` : null,
    proposal.updateCount
      ? `${proposal.updateCount} ${proposal.updateCount === 1 ? 'edit' : 'edits'}`
      : null,
    proposal.removeCount ? `${proposal.removeCount} to the Trash` : null,
  ].filter(Boolean)
  return parts.join(', ')
}
