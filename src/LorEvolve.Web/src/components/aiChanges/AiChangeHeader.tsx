import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import type { Proposal } from '../../aiChanges/types'
import { countWords, sourceWords, STATUS_WORDS } from '../../aiChanges/words'
import { PageHeader } from '../PageHeader'
import { useI18n } from '../../i18n'
import { formatDateTime } from '../../lib/dates'

/** The proposal's head: the way back, its summary, where it came from and who sent it when, its status and its count. */
export function AiChangeHeader({
  proposal,
  backTo,
  who,
}: {
  proposal: Proposal
  backTo: string
  who: string
}) {
  const { t, tx } = useI18n()

  return (
    <PageHeader
      crumb={
        <Link className="aichange__back" to={backTo} data-testid="ai-change-back">
          <ArrowLeft aria-hidden="true" focusable="false" strokeWidth={1.75} />
          {t('review.aiChange.back')}
        </Link>
      }
      title={
        <span dir="auto">
          {proposal.proposal.summary ??
            t('review.aiChange.proposedChanges', { n: proposal.proposal.operationCount })}
        </span>
      }
      titleId="aichange-title"
      lede={
        <>
          {tx('review.aiChange.lede', {
            source: <span data-testid="ai-change-source">{sourceWords(proposal.proposal)}</span>,
            who: <bdi>{who}</bdi>,
            time: (
              <time dateTime={proposal.proposal.createdAt}>
                {formatDateTime(proposal.proposal.createdAt)}
              </time>
            ),
          })}
          <br />
          <span
            className="aichanges__status"
            data-status={proposal.proposal.status}
            data-testid="ai-change-status"
          >
            {STATUS_WORDS[proposal.proposal.status]}
          </span>
          {' · '}
          {countWords(proposal.proposal)}
        </>
      }
    />
  )
}
