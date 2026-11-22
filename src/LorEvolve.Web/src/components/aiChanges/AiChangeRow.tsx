import { Link } from 'react-router-dom'
import { reviewPath } from '../../aiChanges/api'
import { ProposalStatus, type ProposalSummary } from '../../aiChanges/types'
import { countWords, sourceWords, STATUS_WORDS } from '../../aiChanges/words'
import { useI18n } from '../../i18n'
import { DateText } from '../DateText'
import { QuietNote } from '../QuietNote'

/**
 * One proposal in the AI Changes list: its summary opens the review, with who asked, from where and when, then its
 * status and size. `inUniverse` leaves out the universe's name; `backTo` is where the review's Back returns.
 */
export function AiChangeRow({
  proposal,
  inUniverse,
  backTo,
}: {
  proposal: ProposalSummary
  inUniverse: boolean
  backTo: string
}) {
  const { t, tn, tx } = useI18n()
  return (
    <li className="aichanges__item" data-testid="ai-change-proposal">
      <Link
        className="aichanges__link"
        to={reviewPath(proposal.universeId, proposal.id)}
        state={{ backTo }}
      >
        <span className="aichanges__summary" dir="auto">
          {proposal.summary ??
            tn('review.aiChanges.proposedChanges', proposal.operationCount, {
              n: proposal.operationCount,
            })}
        </span>
      </Link>
      <QuietNote className="aichanges__meta" wrap>
        {inUniverse ? null : (
          <>
            <bdi>{proposal.universeName}</bdi>
            {' · '}
          </>
        )}
        <span data-testid="ai-change-source">{sourceWords(proposal)}</span>
        {' · '}
        {proposal.proposedByMe
          ? t('review.aiChanges.askedByYou')
          : tx('review.aiChanges.askedBy', {
              name: <bdi>{proposal.proposedByName ?? t('review.aiChanges.askedByGone')}</bdi>,
            })}
        {' · '}
        <DateText value={proposal.createdAt} withTime />
      </QuietNote>
      <QuietNote className="aichanges__meta" wrap>
        <span className="aichanges__status" data-status={proposal.status}>
          {STATUS_WORDS[proposal.status]}
        </span>
        {' · '}
        {countWords(proposal)}
        {proposal.status === ProposalStatus.Open && proposal.committedCount > 0
          ? ` · ${tn('review.aiChanges.alreadyApplied', proposal.committedCount, { n: proposal.committedCount })}`
          : null}
      </QuietNote>
    </li>
  )
}
