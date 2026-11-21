import { useCallback, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { listProposals } from '../aiChanges/api'
import type { ProposalState } from '../aiChanges/types'
import { AiChangeRow } from '../components/aiChanges/AiChangeRow'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { SegmentedControl } from '../components/SegmentedControl'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { ShowMore } from '../components/ShowMore'
import { ReadGate } from '../components/ReadGate'
import { errorText } from '../lib/errorText'
import { useAsyncRead } from '../lib/useAsyncRead'

/**
 * Pending AI Changes (ADR 0047): the proposals an AI staged and a person decides on, from an app over MCP and from the
 * connected apps, newest first. Account-wide in My workspace; one universe's inside it. Each opens its review.
 */
export default function AiChangesPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const { t } = useI18n()
  const location = useLocation()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? (context?.universe.id ?? null) : null
  const [state, setState] = useState<ProposalState>('open')
  const [more, setMore] = useState(false)
  const read = useCallback(
    (signal: AbortSignal) => listProposals(state, universeId, null, signal),
    [state, universeId],
  )
  const { load, setLoad, retry } = useAsyncRead(read)

  async function readMore() {
    if (load.kind !== 'ready') return
    setMore(true)
    try {
      const next = await listProposals(state, universeId, load.value.items.at(-1)?.id ?? null)
      setLoad({
        kind: 'ready',
        value: { items: [...load.value.items, ...next.items], hasMore: next.hasMore },
      })
    } catch (error) {
      setLoad({ kind: 'error', message: errorText(error, t('review.aiChanges.loadFailed')) })
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
        <SegmentedControl
          label={t('review.aiChanges.which')}
          options={[
            { value: 'open', label: t('review.aiChanges.waiting'), testId: 'ai-changes-open' },
            {
              value: 'decided',
              label: t('review.aiChanges.decided'),
              testId: 'ai-changes-decided',
            },
          ]}
          value={state}
          onChange={show}
        />
      </PageHeader>

      <ReadGate
        load={load}
        loading={{ text: t('review.aiChanges.loading') }}
        error={{
          message: t('review.aiChanges.loadFailed'),
          onRetry: retry,
          retryLabel: t('review.aiChanges.retry'),
        }}
      >
        {(proposals) =>
          proposals.items.length === 0 ? (
            <EmptyState
              testId="ai-changes-empty"
              title={
                state === 'open'
                  ? t('review.aiChanges.emptyOpen')
                  : t('review.aiChanges.emptyDecided')
              }
              hint={t('review.aiChanges.emptyHint')}
            />
          ) : (
            <>
              <ul className="aichanges__list">
                {proposals.items.map((proposal) => (
                  <AiChangeRow
                    key={proposal.id}
                    proposal={proposal}
                    inUniverse={inUniverse}
                    // The proposal's Back returns to this list, account-wide or the universe's.
                    backTo={`${location.pathname}${location.search}`}
                  />
                ))}
              </ul>
              <ShowMore
                align="start"
                hasMore={proposals.hasMore}
                status={more ? 'loading' : 'idle'}
                onMore={() => void readMore()}
              />
            </>
          )
        }
      </ReadGate>
    </section>
  )
}
