import type { Change, Proposal } from '../../aiChanges/types'
import { useI18n } from '../../i18n'
import type { useAiChangeState } from '../../aiChanges/useAiChangeState'

/** The decision bar: what is chosen, Select all, Approve, Reject and Reject all, with the running approval's progress; or Withdraw. */
export function AiChangeDecision({
  proposal,
  open,
  canDecide,
  canApprove,
  pending,
  ready,
  chosen,
  busy,
  applied,
  setSelected,
  listId,
  approve,
  reject,
}: Pick<ReturnType<typeof useAiChangeState>, 'busy' | 'applied' | 'setSelected' | 'listId'> & {
  proposal: Proposal
  open: boolean
  canDecide: boolean
  canApprove: boolean
  pending: Change[]
  ready: Change[]
  chosen: Change[]
  approve: (ids: string[]) => Promise<void>
  reject: (ids: string[] | null) => Promise<void>
}) {
  const { t, tn } = useI18n()

  return canDecide && pending.length > 0 ? (
    <div
      className="aichange__toolbar"
      role="group"
      aria-label={t('review.aiChange.toolbar.label')}
      data-testid="ai-change-toolbar"
    >
      <p className="aichange__chosen" aria-live="polite">
        {chosen.length === 0
          ? t('review.aiChange.toolbar.none')
          : tn('review.aiChange.toolbar.selected', chosen.length, { n: chosen.length })}
      </p>
      <div className="aichange__buttons">
        {canApprove ? (
          <>
            <button
              className="button button--secondary button--sm"
              type="button"
              disabled={busy !== null || ready.length === 0}
              onClick={() => setSelected(new Set(ready.map((change) => change.id)))}
              data-testid="ai-change-select-all"
            >
              {t('review.aiChange.toolbar.selectAll')}
            </button>
            <button
              className="button button--sm"
              type="button"
              disabled={busy !== null || chosen.length === 0}
              aria-describedby={listId}
              onClick={() => void approve(chosen.map((change) => change.id))}
              data-testid="ai-change-approve"
            >
              {busy === 'approve'
                ? t('review.aiChange.toolbar.applying')
                : chosen.length === 0
                  ? t('review.aiChange.toolbar.approveSelected')
                  : tn('review.aiChange.toolbar.approveCount', chosen.length, {
                      n: chosen.length,
                    })}
            </button>
          </>
        ) : null}
        <button
          className="button button--secondary button--sm"
          type="button"
          disabled={busy !== null || chosen.length === 0}
          onClick={() => void reject(chosen.map((change) => change.id))}
          data-testid="ai-change-reject"
        >
          {busy === 'reject'
            ? t('review.aiChange.toolbar.rejecting')
            : t('review.aiChange.toolbar.rejectSelected')}
        </button>
        <button
          className="button button--secondary button--danger-quiet button--sm"
          type="button"
          disabled={busy !== null}
          onClick={() => void reject(null)}
          data-testid="ai-change-reject-all"
        >
          {t('review.aiChange.toolbar.rejectAll')}
        </button>
      </div>
      {applied ? (
        <div className="aichange__progress" data-testid="ai-change-progress">
          <div
            className="progressbar"
            role="progressbar"
            aria-label={t('review.aiChange.progress.label')}
            aria-valuemin={0}
            aria-valuemax={applied.total}
            aria-valuenow={applied.done}
            aria-valuetext={t('review.aiChange.progress.done', {
              done: applied.done,
              total: applied.total,
            })}
            data-state={applied.done === 0 ? 'working' : 'sending'}
          >
            <span
              className="progressbar__fill"
              style={
                applied.done === 0
                  ? undefined
                  : { width: `${(applied.done / applied.total) * 100}%` }
              }
            />
          </div>
          <p className="aichange__count">
            {applied.done === 0
              ? tn('review.aiChange.progress.checking', applied.total, { n: applied.total })
              : t('review.aiChange.progress.done', {
                  done: applied.done,
                  total: applied.total,
                })}
          </p>
        </div>
      ) : null}
    </div>
  ) : !proposal.canReview && open && proposal.proposal.proposedByMe ? (
    <div className="aichange__toolbar">
      <button
        className="button button--secondary button--sm"
        type="button"
        disabled={busy !== null}
        onClick={() => void reject(null)}
        data-testid="ai-change-withdraw"
      >
        {t('review.aiChange.toolbar.withdraw')}
      </button>
    </div>
  ) : null
}
