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
import { useI18n } from '../i18n'
import { formatDateTime } from '../lib/dates'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load = { kind: 'loading' } | { kind: 'ready'; page: ProposalPage } | { kind: 'error' }

/**
 * Pending AI Changes (ADR 0047): the proposals an AI staged and a person decides on, from an app over MCP and from the
 * assistant alike, newest first. Account-wide in My workspace; one universe's inside it. Each opens its review.
 */
export default function AiChangesPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const { t, tn, tx } = useI18n()
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
        title={t('review.aiChanges.title')}
        titleId="aichanges-title"
        lede={inUniverse ? t('review.aiChanges.ledeUniverse') : t('review.aiChanges.ledeAccount')}
      >
        <div className="segmented" role="group" aria-label={t('review.aiChanges.which')}>
          <button
            className="segmented__option"
            type="button"
            aria-pressed={state === 'open'}
            onClick={() => show('open')}
            data-testid="ai-changes-open"
          >
            {t('review.aiChanges.waiting')}
          </button>
          <button
            className="segmented__option"
            type="button"
            aria-pressed={state === 'decided'}
            onClick={() => show('decided')}
            data-testid="ai-changes-decided"
          >
            {t('review.aiChanges.decided')}
          </button>
        </div>
      </PageHeader>

      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('review.aiChanges.loading')}
        </p>
      ) : load.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{t('review.aiChanges.loadFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setReads((count) => count + 1)}
          >
            {t('review.aiChanges.retry')}
          </button>
        </div>
      ) : load.page.items.length === 0 ? (
        <EmptyState
          testId="ai-changes-empty"
          title={
            state === 'open' ? t('review.aiChanges.emptyOpen') : t('review.aiChanges.emptyDecided')
          }
          hint={t('review.aiChanges.emptyHint')}
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
                      tn('review.aiChanges.proposedChanges', proposal.operationCount, {
                        n: proposal.operationCount,
                      })}
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
                  {proposal.proposedByMe
                    ? t('review.aiChanges.askedByYou')
                    : tx('review.aiChanges.askedBy', {
                        name: (
                          <bdi>{proposal.proposedByName ?? t('review.aiChanges.askedByGone')}</bdi>
                        ),
                      })}
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
                    ? ` · ${tn('review.aiChanges.alreadyApplied', proposal.committedCount, { n: proposal.committedCount })}`
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
              {t('review.aiChanges.showMore')}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
