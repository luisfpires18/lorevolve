import type { Change, Proposal } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useAiChangeState } from '../../aiChanges/useAiChangeState'
import { QuietNote } from '../QuietNote'
import { DateText } from '../DateText'
import { FeedbackLine } from '../FormMessage'
import { Callout } from '../Callout'

/** What stands above the decision: the note while open, pictures still to hand over, a block, read-only, and the feedback. */
export function AiChangeNotices({
  universe,
  proposal,
  open,
  awaitingPictures,
  feedback,
  feedbackLine,
}: Pick<ReturnType<typeof useAiChangeState>, 'feedback' | 'feedbackLine'> & {
  universe: WorkspaceContext['universe']
  proposal: Proposal
  open: boolean
  awaitingPictures: Change[]
}) {
  const { t, tn, tx } = useI18n()

  return (
    <>
      {open ? (
        <Callout look="callout" as="p" className="aichange__note">
          {tx('review.aiChange.note.body', {
            universe: universe.name ? (
              <bdi>{universe.name}</bdi>
            ) : (
              t('review.aiChange.note.thisUniverse')
            ),
          })}
          {open ? (
            <>
              {' '}
              {tx('review.aiChange.note.expires', {
                date: <DateText value={proposal.proposal.expiresAt} withTime />,
              })}
            </>
          ) : null}
        </Callout>
      ) : null}

      {open && awaitingPictures.length > 0 ? (
        <Callout
          look="callout"
          tone="warning"
          as="p"
          role="status"
          testId="ai-change-awaiting-pictures"
        >
          {tn('review.aiChange.pictures.waiting', awaitingPictures.length, {
            n: awaitingPictures.length,
          })}{' '}
          {t('review.aiChange.pictures.hand')}
        </Callout>
      ) : null}

      {proposal.blocked ? (
        <Callout look="callout" tone="warning" as="p" role="status" testId="ai-change-blocked">
          {proposal.blocked}
        </Callout>
      ) : null}

      {!proposal.canReview && open ? (
        <QuietNote className="history__quiet" size="ui" testId="ai-change-read-only">
          {t('review.aiChange.readOnly')}
        </QuietNote>
      ) : null}

      <FeedbackLine feedback={feedback} line={feedbackLine} testId="ai-change-feedback" />
    </>
  )
}
