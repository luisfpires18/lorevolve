import { useEffect, useState } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import {
  listProposals,
  ProposalStatus,
  reviewPath,
  type ProposalPage,
  type ProposalState,
} from '../aiChanges/api'
import { countWords, sourceWords, STATUS_WORDS } from '../aiChanges/words'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { formatDateTime } from '../lib/dates'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load = { kind: 'loading' } | { kind: 'ready'; page: ProposalPage } | { kind: 'error' }

/**
 * Pending AI Changes (ADR 0047): the proposals an AI staged and a person decides on, from an app over MCP and from the
 * assistant alike, newest first. Account-wide in My workspace; one universe's inside it. Each opens its review.
 */
export default function AiChangesPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const location = useLocation()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? (context?.universe.id ?? null) : null
  const [state, setState] = useState<ProposalState>('open')
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listProposals(state, universeId, null, controller.signal)
      .then((page) => setLoad({ kind: 'ready', page }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ kind: 'error' })
      })
    return () => controller.abort()
  }, [state, universeId, reads])

  async function readMore() {
    if (load.kind !== 'ready') return
    setMore(true)
    try {
      const next = await listProposals(state, universeId, load.page.items.at(-1)?.id ?? null)
      setLoad({
        kind: 'ready',
        page: { items: [...load.page.items, ...next.items], hasMore: next.hasMore },
      })
    } catch {
      setLoad({ kind: 'error' })
    } finally {
      setMore(false)
    }
  }

  function show(next: ProposalState) {
    setLoad({ kind: 'loading' })
    setState(next)
  }

  return (
    <section className="aichanges" aria-labelledby="aichanges-title" data-testid="ai-changes">
      <PageHeader
        title="Pending AI Changes"
        titleId="aichanges-title"
        lede={
          inUniverse
            ? 'Changes an AI proposed for this universe. Nothing in them is applied until you approve it here.'
            : 'Changes an AI proposed for your universes, from a connected app or the Assistant. Nothing in them is applied until someone approves it.'
        }
      >
        <div className="aichanges__tabs" role="group" aria-label="Which proposals">
          <button
            className={
              state === 'open' ? 'button button--sm' : 'button button--secondary button--sm'
            }
            type="button"
            aria-pressed={state === 'open'}
            onClick={() => show('open')}
            data-testid="ai-changes-open"
          >
            Waiting
          </button>
          <button
            className={
              state === 'decided' ? 'button button--sm' : 'button button--secondary button--sm'
            }
            type="button"
            aria-pressed={state === 'decided'}
            onClick={() => show('decided')}
            data-testid="ai-changes-decided"
          >
            Decided
          </button>
        </div>
      </PageHeader>

      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          Loading&hellip;
        </p>
      ) : load.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>The proposals couldn&rsquo;t be loaded.</p>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setReads((count) => count + 1)}
          >
            Try again
          </button>
        </div>
      ) : load.page.items.length === 0 ? (
        <EmptyState
          testId="ai-changes-empty"
          title={
            state === 'open' ? 'Nothing is waiting for review.' : 'Nothing has been decided yet.'
          }
          hint="Ask the Assistant with Propose changes turned on, or connect an AI app and let it propose changes."
        />
      ) : (
        <>
          <ul className="aichanges__list">
            {load.page.items.map((proposal) => (
              <li className="aichanges__item" key={proposal.id} data-testid="ai-change-proposal">
                <Link
                  className="aichanges__link"
                  to={reviewPath(proposal.universeId, proposal.id)}
                  // The proposal's Back returns to this list, account-wide or the universe's.
                  state={{ backTo: `${location.pathname}${location.search}` }}
                >
                  <span className="aichanges__summary" dir="auto">
                    {proposal.summary ??
                      `${proposal.operationCount} proposed ${proposal.operationCount === 1 ? 'change' : 'changes'}`}
                  </span>
                </Link>
                <p className="aichanges__meta">
                  {inUniverse ? null : (
                    <>
                      <bdi>{proposal.universeName}</bdi>
                      {' · '}
                    </>
                  )}
                  <span data-testid="ai-change-source">{sourceWords(proposal)}</span>
                  {' · '}
                  {proposal.proposedByMe ? (
                    'asked by you'
                  ) : (
                    <>
                      asked by <bdi>{proposal.proposedByName ?? 'someone no longer here'}</bdi>
                    </>
                  )}
                  {' · '}
                  <time dateTime={proposal.createdAt}>{formatDateTime(proposal.createdAt)}</time>
                </p>
                <p className="aichanges__meta">
                  <span className="aichanges__status" data-status={proposal.status}>
                    {STATUS_WORDS[proposal.status]}
                  </span>
                  {' · '}
                  {countWords(proposal)}
                  {proposal.status === ProposalStatus.Open && proposal.committedCount > 0
                    ? ` · ${proposal.committedCount} already applied`
                    : null}
                </p>
              </li>
            ))}
          </ul>
          {load.page.hasMore ? (
            <button
              className="button button--text button--sm"
              type="button"
              disabled={more}
              onClick={() => void readMore()}
            >
              Show more
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
