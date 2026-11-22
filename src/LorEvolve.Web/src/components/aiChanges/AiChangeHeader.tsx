import type { Proposal } from '../../aiChanges/types'
import { countWords, sourceWords, STATUS_WORDS } from '../../aiChanges/words'
import { Crumb } from '../Crumb'
import { PageHeader } from '../PageHeader'
import { useI18n } from '../../i18n'
import { DateText } from '../DateText'

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
        <Crumb
          back
          items={[{ to: backTo, label: t('review.aiChange.back'), testId: 'ai-change-back' }]}
        />
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
            time: <DateText value={proposal.proposal.createdAt} withTime />,
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
