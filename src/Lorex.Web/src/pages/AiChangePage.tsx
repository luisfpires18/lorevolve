import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import {
  approveChanges,
  ChangeAction,
  ChangeResource,
  ChangeStatus,
  editChange,
  getProposal,
  itemPath,
  ProposalStatus,
  rejectChanges,
  type Change,
  type ChangeEditable,
  type Proposal,
} from '../aiChanges/api'
import { compareProse } from '../aiChanges/diff'
import { countWords, sourceWords, STATUS_WORDS } from '../aiChanges/words'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ApiError, NETWORK_FAILURE } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import { CANON_LABELS, CanonStatus, type CanonStatusValue } from '../lore/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; proposal: Proposal }
  | { kind: 'missing' }
  | { kind: 'error' }

type Feedback = { text: string; isError: boolean }

const ACTION_WORDS = {
  [ChangeAction.Create]: 'New',
  [ChangeAction.Update]: 'Edit',
  [ChangeAction.Remove]: 'To the Trash',
  [ChangeAction.Reorder]: 'Order',
} as const

/** A field is archived, not trashed: it keeps its values and comes back from Types. */
const actionWords = (change: Change) =>
  change.resource === ChangeResource.LoreField && change.action === ChangeAction.Remove
    ? 'Archive'
    : ACTION_WORDS[change.action]

/** Prose changes - a scene's manuscript, an entry's article - are shown as prose, never as before-and-after lines. */
const isProse = (change: Change) =>
  change.resource === ChangeResource.Manuscript || change.resource === ChangeResource.Article

/** Changes that can be chosen for approval: waiting, with nothing wrong with them now. */
function approvable(change: Change) {
  return change.status === ChangeStatus.Pending && change.issues.length === 0
}

/**
 * One proposal's review (ADR 0047). Every change an AI proposed, described by LoreX - what it creates, what it changes
 * from and to, what a removal touches, and what stops it now - with the ones that need each other marked. A reviewer
 * selects changes (choosing one selects what it needs; unchoosing one unselects what needs it), approves them together,
 * or rejects them; edits a change's plain values first if they want. Nothing is applied until Approve is pressed, and then
 * exactly what was shown at this revision, all together or not at all.
 */
export default function AiChangePage() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const { proposalId = '' } = useParams<{ proposalId: string }>()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
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
        Opening&hellip;
      </p>
    )
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="ai-change-missing"
        title="That proposal isn't here."
        hint={
          <>
            It may have been removed, or it isn&rsquo;t yours to see.{' '}
            <Link to="..">Back to Pending AI Changes</Link>
          </>
        }
      />
    )
  }

  if (load.kind === 'error' || !proposal) {
    return (
      <div className="notice notice--error" role="alert">
        <p>This proposal couldn&rsquo;t be loaded.</p>
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={() => setReads((count) => count + 1)}
        >
          Try again
        </button>
      </div>
    )
  }

  const changes = proposal.operations
  const open = proposal.proposal.status === ProposalStatus.Open
  const canDecide = proposal.canReview && open
  const canApprove = canDecide && proposal.blocked === null
  const pending = changes.filter((change) => change.status === ChangeStatus.Pending)
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
    try {
      const receipt = await approveChanges(
        universe.id,
        proposal.proposal.id,
        proposal.revision,
        ids,
        approval.current.id,
      )
      approval.current = null
      accept(
        receipt.proposal,
        `${receipt.applied.length === 1 ? '1 change was' : `${receipt.applied.length} changes were`} applied.`,
      )
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 0) {
        setFeedback({
          text: `${NETWORK_FAILURE} Pressing Approve again won't apply anything twice.`,
          isError: true,
        })
      } else {
        approval.current = null
        setFeedback({
          text:
            error instanceof ApiError
              ? error.message
              : 'LoreX couldn’t apply these changes. Try again.',
          isError: true,
        })
        setReads((count) => count + 1)
      }
    } finally {
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
          ? 'Every waiting change was rejected. Nothing was applied.'
          : 'Rejected. Nothing was applied.',
      )
    } catch (error: unknown) {
      setFeedback({
        text:
          error instanceof ApiError
            ? error.message
            : 'LoreX couldn’t reject these changes. Try again.',
        isError: true,
      })
      setReads((count) => count + 1)
    } finally {
      setBusy(null)
    }
  }

  const who = proposal.proposal.proposedByMe
    ? 'you'
    : (proposal.proposal.proposedByName ?? 'someone no longer here')

  return (
    <section className="aichange" aria-labelledby="aichange-title" data-testid="ai-change">
      <PageHeader
        crumb={<Link to={`/app/universes/${universe.id}/ai-changes`}>Pending AI Changes</Link>}
        title={
          <span dir="auto">
            {proposal.proposal.summary ?? `${proposal.proposal.operationCount} proposed changes`}
          </span>
        }
        titleId="aichange-title"
        lede={
          <>
            From <span data-testid="ai-change-source">{sourceWords(proposal.proposal)}</span>, asked
            for by <bdi>{who}</bdi> ·{' '}
            <time dateTime={proposal.proposal.createdAt}>
              {formatDateTime(proposal.proposal.createdAt)}
            </time>
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
          Nothing here has changed {universe.name ? <bdi>{universe.name}</bdi> : 'this universe'}{' '}
          yet. Approved changes are applied together, through the same checks as your own edits.
          Removals go to the Trash, never away for good.
          {open
            ? ` If no one decides, this proposal closes on ${formatDateTime(proposal.proposal.expiresAt)}.`
            : null}
        </p>
      ) : null}

      {proposal.blocked ? (
        <p className="callout callout--warning" role="status" data-testid="ai-change-blocked">
          {proposal.blocked}
        </p>
      ) : null}

      {!proposal.canReview && open ? (
        <p className="history__quiet" data-testid="ai-change-read-only">
          Your role can&rsquo;t approve changes here. The owner or an Editor of this universe
          decides them.
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
          aria-label="Decide"
          data-testid="ai-change-toolbar"
        >
          <p className="aichange__chosen" aria-live="polite">
            {chosen.length === 0 ? 'No changes selected.' : `${chosen.length} selected.`}
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
                  Select all that can be applied
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
                    ? 'Applying'
                    : `Approve ${chosen.length === 0 ? 'selected' : chosen.length}`}
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
              {busy === 'reject' ? 'Rejecting' : 'Reject selected'}
            </button>
            <button
              className="button button--secondary button--danger-quiet button--sm"
              type="button"
              disabled={busy !== null}
              onClick={() => void reject(null)}
              data-testid="ai-change-reject-all"
            >
              Reject all
            </button>
          </div>
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
            Withdraw this proposal
          </button>
        </div>
      ) : null}

      <ol className="aichange__list" id={listId} aria-label="Proposed changes">
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
              accept(next, 'Your edit was saved. Review it, then approve.')
            }}
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
}) {
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
            {isProse(change) ? 'Prose' : actionWords(change)}
          </span>
          <h2 className="aichangeitem__title" id={titleId} dir="auto">
            {change.title}
          </h2>
        </div>
        {!pending ? (
          <span className="aichangeitem__outcome" data-testid="ai-change-outcome">
            {change.status === ChangeStatus.Committed
              ? 'Applied'
              : change.resolutionNote === 'expired'
                ? 'Expired'
                : 'Rejected'}
            {change.resolvedByName ? (
              <>
                {' by '}
                <bdi>{change.resolvedByName}</bdi>
              </>
            ) : null}
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
                        <span className="visually-hidden">Now: </span>
                        {line.before ?? 'empty'}
                      </span>
                      <span className="aichangeitem__arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="aichangeitem__after" dir="auto">
                        <span className="visually-hidden">Proposed: </span>
                        {line.after ?? 'empty'}
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

        {change.impact ? (
          <ul className="aichangeitem__impact" data-testid="ai-change-impact">
            {change.impact.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        {pending && needs.length > 0 ? (
          <p className="aichangeitem__deps" data-testid="ai-change-needs">
            Needs: {named(needs).join('; ')}. Selecting this selects them too.
          </p>
        ) : null}
        {pending && neededBy.length > 0 ? (
          <p className="aichangeitem__deps">
            Needed by: {named(neededBy).join('; ')}. Rejecting this rejects them too.
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
          Open it
        </Link>
      ) : null}

      {change.editable && !editing ? (
        <button
          className="button button--text button--sm"
          type="button"
          onClick={() => onEdit(true)}
          aria-label={`Edit ${change.title} before approving`}
          data-testid="ai-change-edit"
        >
          Edit before approving
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

/** A manuscript change, as prose: what is added, or the paragraphs it would take out and put in. */
function ProseChange({ change }: { change: Change }) {
  const prose = change.prose!
  if (prose.append || prose.current === null) {
    return (
      <div className="aichangeprose">
        <p className="aichangeprose__label">
          {prose.append ? 'Added at the end' : 'The new prose'}
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
      <p className="aichangeprose__label">Changes to the prose</p>
      {parts.map((part, index) =>
        part.kind === 'same' ? (
          <p className="aichangeprose__same" key={index}>
            {part.paragraphs.length === 1
              ? '1 paragraph unchanged'
              : `${part.paragraphs.length} paragraphs unchanged`}
          </p>
        ) : (
          <div
            className={`aichangeprose__text aichangeprose__text--${part.kind}`}
            key={index}
            dir="auto"
          >
            <span className="visually-hidden">
              {part.kind === 'added' ? 'Added: ' : 'Taken out: '}
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
      setError(
        problem instanceof ApiError ? problem.message : 'Your edit couldn’t be saved. Try again.',
      )
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
      aria-label={`Edit ${change.title}`}
      data-testid="ai-change-edit-form"
    >
      {text('name', 'Name')}
      {text('title', 'Title')}
      {text('summary', 'Summary', true)}
      {text('premise', 'Premise', true)}
      {text('notes', 'Notes', true)}
      {text('description', 'Description', true)}
      {text(
        'text',
        change.resource === ChangeResource.Manuscript
          ? 'Prose'
          : change.resource === ChangeResource.Idea
            ? 'Idea'
            : 'Text',
        true,
      )}
      {draft.canonStatus !== undefined && draft.canonStatus !== null ? (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-canon`}>
            Canon status
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
          {saving ? 'Saving' : 'Save edit'}
        </button>
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
