import { useMemo } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { ChangeStatus, ProposalStatus } from '../aiChanges/types'
import { EmptyState } from '../components/EmptyState'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { aiChangeActions } from '../aiChanges/aiChangeActions'
import { approvable } from '../aiChanges/changeTraits'
import { useAiChangeReads } from '../aiChanges/useAiChangeReads'
import { useAiChangeState } from '../aiChanges/useAiChangeState'
import { AiChangeDecision } from '../components/aiChanges/AiChangeDecision'
import { AiChangeHeader } from '../components/aiChanges/AiChangeHeader'
import { AiChangeNotices } from '../components/aiChanges/AiChangeNotices'
import { ChangeItem } from '../components/aiChanges/ChangeItem'
import { ReadGate } from '../components/ReadGate'

/**
 * One proposal's review (ADR 0047). Every change an AI proposed, described by LorEvolve - what it creates, what it changes
 * from and to, what a removal touches, and what stops it now - with the ones that need each other marked. A reviewer
 * selects changes (choosing one selects what it needs; unchoosing one unselects what needs it), approves them together,
 * or rejects them; edits a change's plain values first if they want. Nothing is applied until Approve is pressed, and then
 * exactly what was shown at this revision, all together or not at all.
 */
export default function AiChangePage() {
  const { t, tn } = useI18n()
  const { universe } = useOutletContext<WorkspaceContext>()
  const location = useLocation()
  const { proposalId = '' } = useParams<{ proposalId: string }>()
  const state = useAiChangeState()
  const { load, setLoad, setReads, selected, editing, setEditing, listId } = state
  useAiChangeReads({ ...state, universe, proposalId })

  const proposal = load.kind === 'ready' ? load.value : null
  const byKey = useMemo(
    () => new Map((proposal?.operations ?? []).map((change) => [change.key, change])),
    [proposal],
  )

  // The gate draws loading, missing and failed; the ready page below needs the proposal outside it.
  if (!proposal) {
    return (
      <ReadGate
        load={load}
        loading={{ text: t('review.aiChange.opening') }}
        error={{
          message: t('review.aiChange.loadFailed'),
          onRetry: () => setReads((count) => count + 1),
          retryLabel: t('review.aiChange.retry'),
        }}
        missing={
          <EmptyState
            testId="ai-change-missing"
            title={t('review.aiChange.missing.title')}
            hint={
              <>
                {t('review.aiChange.missing.hint')}{' '}
                <Link to="..">{t('review.aiChange.missing.back')}</Link>
              </>
            }
          />
        }
      >
        {() => null}
      </ReadGate>
    )
  }

  const changes = proposal.operations
  const open = proposal.proposal.status === ProposalStatus.Open
  // Back to the list this was opened from - the account-wide one keeps every universe - else the universe's own.
  const backTo =
    (location.state as { backTo?: string } | null)?.backTo ??
    `/app/universes/${universe.id}/ai-changes`
  const canDecide = proposal.canReview && open
  const canApprove = canDecide && proposal.blocked === null
  const pending = changes.filter((change) => change.status === ChangeStatus.Pending)
  // Pictures the AI asked for and nobody has uploaded yet: each holds its change back until the file is here.
  const awaitingPictures = pending.filter((change) => change.media && !change.media.uploaded)
  const ready = pending.filter(approvable)
  const chosen = changes.filter((change) => selected.has(change.id))

  const { toggle, accept, approve, reject } = aiChangeActions({
    ...state,
    proposal,
    byKey,
    universe,
    t,
    tn,
  })

  const who = proposal.proposal.proposedByMe
    ? t('review.aiChange.who.you')
    : (proposal.proposal.proposedByName ?? t('review.aiChange.who.gone'))

  return (
    <section className="aichange" aria-labelledby="aichange-title" data-testid="ai-change">
      <AiChangeHeader proposal={proposal} backTo={backTo} who={who} />

      <AiChangeNotices
        {...state}
        universe={universe}
        proposal={proposal}
        open={open}
        awaitingPictures={awaitingPictures}
      />

      <AiChangeDecision
        {...state}
        proposal={proposal}
        open={open}
        canDecide={canDecide}
        canApprove={canApprove}
        pending={pending}
        ready={ready}
        chosen={chosen}
        approve={approve}
        reject={reject}
      />

      <ol className="aichange__list" id={listId} aria-label={t('review.aiChange.listLabel')}>
        {changes.map((change) => (
          <ChangeItem
            key={change.id}
            universeId={universe.id}
            proposal={proposal}
            change={change}
            byKey={byKey}
            selectable={canApprove && approvable(change)}
            selected={selected.has(change.id)}
            onToggle={(on) => toggle(change, on)}
            editing={editing === change.id}
            onEdit={(on) => setEditing(on ? change.id : null)}
            onEdited={(next) => {
              setEditing(null)
              accept(next, t('review.aiChange.feedback.edited'))
            }}
            // An upload says so beside the picture, and the page stays where it is.
            onUploaded={(next) => setLoad({ kind: 'ready', value: next })}
          />
        ))}
      </ol>
    </section>
  )
}
