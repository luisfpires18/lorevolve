import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  approveChanges,
  getApprovalProgress,
  ChangeAction,
  ChangeResource,
  ChangeStatus,
  editChange,
  getProposal,
  itemPath,
  mediaPreviewPath,
  ProposalStatus,
  rejectChanges,
  uploadChangeMedia,
  type Change,
  type ChangeEditable,
  type Proposal,
} from '../aiChanges/api'
import { compareProse } from '../aiChanges/diff'
import { countWords, sourceWords, STATUS_WORDS } from '../aiChanges/words'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { t, useI18n } from '../i18n'
import { ApiError, networkFailure } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { CANON_LABELS, CanonStatus, type CanonStatusValue } from '../lore/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; proposal: Proposal }
  | { kind: 'missing' }
  | { kind: 'error' }

type Feedback = { text: string; isError: boolean }

const ACTION_KEYS = {
  [ChangeAction.Create]: 'review.aiChange.item.action.create',
  [ChangeAction.Update]: 'review.aiChange.item.action.update',
  [ChangeAction.Remove]: 'review.aiChange.item.action.remove',
  [ChangeAction.Reorder]: 'review.aiChange.item.action.reorder',
} as const

/** A field is archived, not trashed: it keeps its values and comes back from Types. */
const actionWords = (change: Change) =>
  change.resource === ChangeResource.LoreField && change.action === ChangeAction.Remove
    ? t('review.aiChange.item.action.archive')
    : t(ACTION_KEYS[change.action])

/** Prose changes - a scene's manuscript, an entry's article - are shown as prose, never as before-and-after lines. */
const isProse = (change: Change) =>
  change.resource === ChangeResource.Manuscript || change.resource === ChangeResource.Article

/** Changes that can be chosen for approval: waiting, with nothing wrong with them now. */
function approvable(change: Change) {
  return change.status === ChangeStatus.Pending && change.issues.length === 0
}

/**
 * One proposal's review (ADR 0047). Every change an AI proposed, described by LorEvolve - what it creates, what it changes
 * from and to, what a removal touches, and what stops it now - with the ones that need each other marked. A reviewer
 * selects changes (choosing one selects what it needs; unchoosing one unselects what needs it), approves them together,
 * or rejects them; edits a change's plain values first if they want. Nothing is applied until Approve is pressed, and then
 * exactly what was shown at this revision, all together or not at all.
 */
export default function AiChangePage() {
  const { t, tn, tx } = useI18n()
  const { universe } = useOutletContext<WorkspaceContext>()
  const location = useLocation()
  const { proposalId = '' } = useParams<{ proposalId: string }>()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  // A running approval's count, read from the server while the one request that applies everything is open.
  const [applied, setApplied] = useState<{ done: number; total: number } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // One approval keeps its id until it is answered, so pressing again after a lost answer applies nothing twice.
  const approval = useRef<{ key: string; id: string } | null>(null)
  const feedbackLine = useRef<HTMLParagraphElement>(null)
  const listId = useId()

  useEffect(() => {
    const controller = new AbortController()
    getProposal(universe.id, proposalId, controller.signal)
      .then((proposal) => setLoad({ kind: 'ready', proposal }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })
    return () => controller.abort()
  }, [universe.id, proposalId, reads])

  useEffect(() => {
    if (feedback) feedbackLine.current?.focus()
  }, [feedback])

  const proposal = load.kind === 'ready' ? load.proposal : null
  const byKey = useMemo(
    () => new Map((proposal?.operations ?? []).map((change) => [change.key, change])),
    [proposal],
  )

  if (load.kind === 'loading') {
    return (
      <p className="notice" role="status">
        {t('review.aiChange.opening')}
      </p>
    )
  }

  if (load.kind === 'missing') {
    return (
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
    )
  }

  if (load.kind === 'error' || !proposal) {
    return (
      <div className="notice notice--error" role="alert">
        <p>{t('review.aiChange.loadFailed')}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setReads((count) => count + 1)}
        >
          {t('review.aiChange.retry')}
        </button>
      </div>
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

  /** A change and, transitively, every pending change it needs. */
  function withNeeds(change: Change, into: Set<string>) {
    into.add(change.id)
    for (const key of change.dependsOn) {
      const need = byKey.get(key)
      if (need && need.status === ChangeStatus.Pending && !into.has(need.id)) withNeeds(need, into)
    }
  }

  /** A change and, transitively, every pending change that needs it. */
  function withNeededBy(change: Change, into: Set<string>) {
    into.add(change.id)
    for (const key of change.neededBy) {
      const other = byKey.get(key)
      if (other && other.status === ChangeStatus.Pending && !into.has(other.id))
        withNeededBy(other, into)
    }
  }

  function toggle(change: Change, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      const touched = new Set<string>()
      if (on) withNeeds(change, touched)
      else withNeededBy(change, touched)
      for (const id of touched) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function accept(next: Proposal, text: string) {
    setLoad({ kind: 'ready', proposal: next })
    setSelected(new Set())
    setFeedback({ text, isError: false })
  }

  async function approve(ids: string[]) {
    if (!proposal || ids.length === 0) return
    const key = `${proposal.revision}:${[...ids].sort().join(',')}`
    if (approval.current?.key !== key) approval.current = { key, id: crypto.randomUUID() }
    setBusy('approve')
    setFeedback(null)
    setApplied({ done: 0, total: ids.length })
    const approvalId = approval.current.id
    const watch = new AbortController()
    const timer = window.setInterval(() => {
      getApprovalProgress(universe.id, proposal.proposal.id, approvalId, watch.signal)
        .then((count) => {
          if (!watch.signal.aborted) setApplied(count)
        })
        .catch(() => undefined)
    }, 500)
    try {
      const receipt = await approveChanges(
        universe.id,
        proposal.proposal.id,
        proposal.revision,
        ids,
        approvalId,
      )
      approval.current = null
      accept(
        receipt.proposal,
        tn('review.aiChange.feedback.applied', receipt.applied.length, {
          n: receipt.applied.length,
        }),
      )
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 0) {
        setFeedback({
          text: t('review.aiChange.feedback.networkFailure', { failure: networkFailure() }),
          isError: true,
        })
      } else {
        approval.current = null
        setFeedback({
          text:
            error instanceof ApiError ? error.message : t('review.aiChange.feedback.applyFailed'),
          isError: true,
        })
        setReads((count) => count + 1)
      }
    } finally {
      window.clearInterval(timer)
      watch.abort()
      setApplied(null)
      setBusy(null)
    }
  }

  async function reject(ids: string[] | null) {
    if (!proposal) return
    setBusy('reject')
    setFeedback(null)
    try {
      const next = await rejectChanges(universe.id, proposal.proposal.id, ids)
      accept(
        next,
        ids === null
          ? t('review.aiChange.feedback.rejectedAll')
          : t('review.aiChange.feedback.rejected'),
      )
    } catch (error: unknown) {
      setFeedback({
        text:
          error instanceof ApiError ? error.message : t('review.aiChange.feedback.rejectFailed'),
        isError: true,
      })
      setReads((count) => count + 1)
    } finally {
      setBusy(null)
    }
  }

  const who = proposal.proposal.proposedByMe
    ? t('review.aiChange.who.you')
    : (proposal.proposal.proposedByName ?? t('review.aiChange.who.gone'))

  return (
    <section className="aichange" aria-labelledby="aichange-title" data-testid="ai-change">
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
        <p className="history__quiet" data-testid="ai-change-read-only">
          {t('review.aiChange.readOnly')}
        </p>
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

      {canDecide && pending.length > 0 ? (
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
      ) : null}

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
            onUploaded={(next) => setLoad({ kind: 'ready', proposal: next })}
          />
        ))}
      </ol>
    </section>
  )
}

function ChangeItem({
  universeId,
  proposal,
  change,
  byKey,
  selectable,
  selected,
  onToggle,
  editing,
  onEdit,
  onEdited,
  onUploaded,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  byKey: Map<string, Change>
  selectable: boolean
  selected: boolean
  onToggle: (on: boolean) => void
  editing: boolean
  onEdit: (on: boolean) => void
  onEdited: (next: Proposal) => void
  onUploaded: (next: Proposal) => void
}) {
  const { t, tx } = useI18n()
  const titleId = useId()
  const detailsId = useId()
  const pending = change.status === ChangeStatus.Pending
  const link = change.status === ChangeStatus.Committed ? itemPath(universeId, change) : null
  const named = (keys: string[]) => keys.map((key) => byKey.get(key)?.title ?? key)
  // Only what still waits: a change already applied or rejected is nothing to select or reject with this one.
  const waiting = (keys: string[]) =>
    keys.filter((key) => byKey.get(key)?.status === ChangeStatus.Pending)
  const needs = waiting(change.dependsOn)
  const neededBy = waiting(change.neededBy)

  return (
    <li
      className="aichangeitem"
      data-testid="ai-change-item"
      data-key={change.key}
      data-status={change.status}
      data-conflict={change.isConflict ? 'true' : 'false'}
      aria-labelledby={titleId}
    >
      <div className="aichangeitem__head">
        {selectable ? (
          <input
            className="aichangeitem__check"
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            aria-labelledby={titleId}
            aria-describedby={detailsId}
            data-testid="ai-change-select"
          />
        ) : null}
        <div className="aichangeitem__heading">
          <span className="aichangeitem__action" data-action={change.action}>
            {isProse(change) ? t('review.aiChange.item.prose') : actionWords(change)}
          </span>
          <h2 className="aichangeitem__title" id={titleId} dir="auto">
            {change.title}
          </h2>
        </div>
        {!pending ? (
          <span className="aichangeitem__outcome" data-testid="ai-change-outcome">
            {change.resolvedByName
              ? tx(
                  change.status === ChangeStatus.Committed
                    ? 'review.aiChange.item.appliedBy'
                    : change.resolutionNote === 'expired'
                      ? 'review.aiChange.item.expiredBy'
                      : 'review.aiChange.item.rejectedBy',
                  { name: <bdi>{change.resolvedByName}</bdi> },
                )
              : change.status === ChangeStatus.Committed
                ? t('review.aiChange.item.applied')
                : change.resolutionNote === 'expired'
                  ? t('review.aiChange.item.expired')
                  : t('review.aiChange.item.rejected')}
          </span>
        ) : null}
      </div>

      <div id={detailsId}>
        {change.lines.length > 0 ? (
          <dl className="aichangeitem__lines">
            {change.lines.map((line, index) => (
              <div className="aichangeitem__line" key={`${line.label}-${index}`}>
                <dt>{line.label}</dt>
                <dd>
                  {(change.action === ChangeAction.Update ||
                    change.action === ChangeAction.Reorder) &&
                  !isProse(change) ? (
                    <>
                      <span className="aichangeitem__before" dir="auto">
                        <span className="visually-hidden">{t('review.aiChange.item.now')}</span>
                        {line.before ?? t('review.aiChange.item.empty')}
                      </span>
                      <span className="aichangeitem__arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="aichangeitem__after" dir="auto">
                        <span className="visually-hidden">
                          {t('review.aiChange.item.proposed')}
                        </span>
                        {line.after ?? t('review.aiChange.item.empty')}
                      </span>
                    </>
                  ) : (
                    <span dir="auto">{line.after}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {change.prose ? <ProseChange change={change} /> : null}

        {change.media ? (
          <MediaChange
            universeId={universeId}
            proposal={proposal}
            change={change}
            onUploaded={onUploaded}
          />
        ) : null}

        {change.impact ? (
          <ul className="aichangeitem__impact" data-testid="ai-change-impact">
            {change.impact.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        {pending && needs.length > 0 ? (
          <p className="aichangeitem__deps" data-testid="ai-change-needs">
            {t('review.aiChange.item.needs', { list: named(needs).join('; ') })}
          </p>
        ) : null}
        {pending && neededBy.length > 0 ? (
          <p className="aichangeitem__deps">
            {t('review.aiChange.item.neededBy', { list: named(neededBy).join('; ') })}
          </p>
        ) : null}

        {pending && change.issues.length > 0 ? (
          <ul
            className={
              change.isConflict
                ? 'callout callout--warning aichangeitem__issues'
                : 'form__message aichangeitem__issues'
            }
            data-testid="ai-change-issues"
          >
            {change.issues.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {link ? (
        <Link
          className="button button--text button--sm"
          to={link}
          data-testid="ai-change-open-item"
        >
          {t('review.aiChange.item.open')}
        </Link>
      ) : null}

      {change.editable && !editing ? (
        <button
          className="button button--text button--sm"
          type="button"
          onClick={() => onEdit(true)}
          aria-label={t('review.aiChange.item.editLabel', { title: change.title })}
          data-testid="ai-change-edit"
        >
          {t('review.aiChange.item.edit')}
        </button>
      ) : null}

      {editing && change.editable ? (
        <EditChange
          universeId={universeId}
          proposal={proposal}
          change={change}
          values={change.editable}
          onCancel={() => onEdit(false)}
          onSaved={onEdited}
        />
      ) : null}
    </li>
  )
}

/**
 * A picture change's hand-over (ADR 0062): the AI sends no file, so the person uploads it here. It waits in quarantine - seen
 * only on this page - until the change is approved, and goes if it is rejected. Uploading again replaces it.
 */
function MediaChange({
  universeId,
  proposal,
  change,
  onUploaded,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  onUploaded: (next: Proposal) => void
}) {
  const { t } = useI18n()
  const media = change.media!
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const waiting =
    change.status === ChangeStatus.Pending &&
    proposal.proposal.status === ProposalStatus.Open &&
    (proposal.canReview || proposal.proposal.proposedByMe)

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    setUploaded(false)
    try {
      onUploaded(await uploadChangeMedia(universeId, proposal.proposal.id, change.id, file))
      setUploaded(true)
    } catch (problem: unknown) {
      setError(
        problem instanceof ApiError
          ? (Object.values(problem.fieldErrors)[0] ?? problem.message)
          : t('review.aiChange.media.failed'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="aichangeitem__media" data-testid="ai-change-media">
      {media.uploaded && media.uploadedAt ? (
        <figure className="aichangeitem__picture">
          <img
            src={mediaPreviewPath(universeId, proposal.proposal.id, change.id, media.uploadedAt)}
            alt={t('review.aiChange.media.alt', { title: change.title })}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            data-testid="ai-change-media-preview"
          />
          <figcaption>
            {media.fileName ?? t('review.aiChange.media.fallbackName')} · {media.width}×
            {media.height}
          </figcaption>
        </figure>
      ) : (
        <p className="aichangeitem__deps">{t('review.aiChange.media.none')}</p>
      )}
      {waiting ? (
        <div className="field">
          <label className="field__label" htmlFor={inputId}>
            {media.uploaded
              ? t('review.aiChange.media.replace')
              : t('review.aiChange.media.upload')}
          </label>
          <input
            id={inputId}
            className="field__input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
            data-testid="ai-change-media-file"
          />
        </div>
      ) : null}
      {uploaded ? (
        <p className="aichangeitem__deps" role="status" data-testid="ai-change-media-uploaded">
          {t('review.aiChange.media.uploaded')}
        </p>
      ) : null}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A manuscript change, as prose: what is added, or the paragraphs it would take out and put in. */
function ProseChange({ change }: { change: Change }) {
  const { t, tn } = useI18n()
  const prose = change.prose!
  if (prose.append || prose.current === null) {
    return (
      <div className="aichangeprose">
        <p className="aichangeprose__label">
          {prose.append ? t('review.aiChange.prose.appended') : t('review.aiChange.prose.added')}
        </p>
        <div className="aichangeprose__text aichangeprose__text--added" dir="auto">
          {prose.proposed}
        </div>
      </div>
    )
  }

  const parts = compareProse(prose.current, prose.proposed)
  return (
    <div className="aichangeprose" data-testid="ai-change-prose">
      <p className="aichangeprose__label">{t('review.aiChange.prose.changes')}</p>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          <p className="aichangeprose__same" key={index}>
            {tn('review.aiChange.prose.unchanged', part.paragraphs.length, {
              n: part.paragraphs.length,
            })}
          </p>
        ) : (
          <div
            className={`aichangeprose__text aichangeprose__text--${part.kind}`}
            key={index}
            dir="auto"
          >
            <span className="visually-hidden">
              {part.kind === 'added'
                ? t('review.aiChange.prose.addedHidden')
                : t('review.aiChange.prose.removedHidden')}
            </span>
            {part.paragraphs.join('\n\n')}
          </div>
        ),
      )}
    </div>
  )
}

/** The plain values a reviewer may change before approving. Saved over the proposal's revision, then checked again. */
function EditChange({
  universeId,
  proposal,
  change,
  values,
  onCancel,
  onSaved,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  values: ChangeEditable
  onCancel: () => void
  onSaved: (next: Proposal) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<ChangeEditable>(values)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const form = useRef<HTMLFormElement>(null)

  // The first value takes the focus, so a keyboard edit starts where it should.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(
        await editChange(universeId, proposal.proposal.id, change.id, proposal.revision, draft),
      )
    } catch (problem: unknown) {
      setError(problem instanceof ApiError ? problem.message : t('review.aiChange.edit.failed'))
      setSaving(false)
    }
  }

  const text = (name: keyof ChangeEditable, label: string, long = false) =>
    draft[name] === undefined || draft[name] === null ? null : (
      <div className="field">
        <label className="field__label" htmlFor={`${id}-${name}`}>
          {label}
        </label>
        {long ? (
          <textarea
            id={`${id}-${name}`}
            className="field__input field__input--area"
            rows={name === 'text' ? 10 : 3}
            dir="auto"
            value={String(draft[name] ?? '')}
            onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
          />
        ) : (
          <input
            id={`${id}-${name}`}
            className="field__input"
            dir="auto"
            value={String(draft[name] ?? '')}
            onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
            data-testid={`ai-change-edit-${name}`}
          />
        )}
      </div>
    )

  return (
    <form
      ref={form}
      className="aichangeedit"
      onSubmit={(event) => void submit(event)}
      aria-label={t('review.aiChange.edit.form', { title: change.title })}
      data-testid="ai-change-edit-form"
    >
      {text('name', t('review.aiChange.edit.name'))}
      {text('title', t('review.aiChange.edit.title'))}
      {text('summary', t('review.aiChange.edit.summary'), true)}
      {text('premise', t('review.aiChange.edit.premise'), true)}
      {text('notes', t('review.aiChange.edit.notes'), true)}
      {text('description', t('review.aiChange.edit.description'), true)}
      {text(
        'text',
        change.resource === ChangeResource.Manuscript
          ? t('review.aiChange.edit.prose')
          : change.resource === ChangeResource.Idea
            ? t('review.aiChange.edit.idea')
            : t('review.aiChange.edit.text'),
        true,
      )}
      {draft.canonStatus !== undefined && draft.canonStatus !== null ? (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-canon`}>
            {t('review.aiChange.edit.canon')}
          </label>
          <select
            id={`${id}-canon`}
            className="field__input"
            value={draft.canonStatus}
            onChange={(event) =>
              setDraft({ ...draft, canonStatus: Number(event.target.value) as CanonStatusValue })
            }
          >
            {[CanonStatus.Idea, CanonStatus.Draft, CanonStatus.Canon].map((status) => (
              <option key={status} value={status}>
                {CANON_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
        <button
          className="button button--sm"
          type="submit"
          disabled={saving}
          data-testid="ai-change-edit-save"
        >
          {saving ? t('review.aiChange.edit.saving') : t('review.aiChange.edit.save')}
        </button>
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          {t('review.aiChange.edit.cancel')}
        </button>
      </div>
    </form>
  )
}
