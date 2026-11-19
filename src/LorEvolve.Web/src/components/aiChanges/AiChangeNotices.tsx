import type { Change, Proposal } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import { formatDateTime } from '../../lib/dates'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useAiChangeState } from '../../aiChanges/useAiChangeState'
import { QuietNote } from '../QuietNote'

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
        <p className="callout aichange__note">
          {tx('review.aiChange.note.body', {
            universe: universe.name ? (
              <bdi>{universe.name}</bdi>
            ) : (
              t('review.aiChange.note.thisUniverse')
            ),
          })}
          {open
            ? ` ${t('review.aiChange.note.expires', { date: formatDateTime(proposal.proposal.expiresAt) })}`
            : null}
        </p>
      ) : null}

      {open && awaitingPictures.length > 0 ? (
        <p
          className="callout callout--warning"
          role="status"
          data-testid="ai-change-awaiting-pictures"
        >
          {tn('review.aiChange.pictures.waiting', awaitingPictures.length, {
            n: awaitingPictures.length,
          })}{' '}
          {t('review.aiChange.pictures.hand')}
        </p>
      ) : null}

      {proposal.blocked ? (
        <p className="callout callout--warning" role="status" data-testid="ai-change-blocked">
          {proposal.blocked}
        </p>
      ) : null}

      {!proposal.canReview && open ? (
        <QuietNote className="history__quiet" size="ui" testId="ai-change-read-only">
          {t('review.aiChange.readOnly')}
        </QuietNote>
      ) : null}

      {feedback ? (
        <p
          className={feedback.isError ? 'form__message' : 'callout'}
          role={feedback.isError ? 'alert' : 'status'}
          tabIndex={-1}
          ref={feedbackLine}
          data-testid="ai-change-feedback"
        >
          {feedback.text}
        </p>
      ) : null}
    </>
  )
}
