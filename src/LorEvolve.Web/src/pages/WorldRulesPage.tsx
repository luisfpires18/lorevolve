import { useEffect, useId, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Plus } from 'lucide-react'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { Quoted } from '../components/NameList'
import { formatDate } from '../lib/dates'
import { listWorldRules } from '../worldRules/api'
import type { WorldRulePage } from '../worldRules/types'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: WorldRulePage } | { kind: 'error'; message: string }

/** What a rule's editor says it did before handing back to the list. */
export interface WorldRulesListNotice {
  deleted?: { id: string; title: string }
}

/**
 * A universe's World Rules: explicit statements, in the author's words, about how the world works (ADR 0033).
 *
 * A rule book, not a board. Rules are listed by title, so a rule's place says nothing about how much it matters, and each
 * row is its title and a line of what it says. A rule's words are never read; a row says only whether the author gave the rule
 * a timeline check (ADR 0034), and what that check finds is on the rule itself. The page lives in the address, so Back and a
 * reload keep it.
 */
export default function WorldRulesPage() {
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const basePath = `/app/universes/${universe.id}/world-rules`
  const trashPath = `/app/universes/${universe.id}/trash`

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as WorldRulesListNotice | null)?.deleted ?? null

  useEffect(() => {
    const controller = new AbortController()

    listWorldRules(universe.id, page, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: 'The rules could not be read.' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, page, reads])

  function goToPage(next: number) {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next <= 1) updated.delete('page')
      else updated.set('page', String(next))
      return updated
    })
  }

  const result = state.kind === 'ready' ? state.page : null

  return (
    <section className="rules" aria-labelledby={headingId} data-testid="world-rules">
      <PageHeader
        title="World Rules"
        titleId={headingId}
        lede="Explicit statements about how this universe works, kept exactly as you write them. LorEvolve never reads their words; only a timeline check you give a rule is counted."
        actions={
          access.editContent ? (
            <Link className="button" to={`${basePath}/new`} data-testid="new-world-rule">
              <ActionIcon icon={Plus} />
              New rule
            </Link>
          ) : undefined
        }
      />

      {notice ? (
        <div className="notice rules__notice" data-testid="world-rules-deleted-notice">
          <p role="status">
            <Quoted text={notice.title} /> was moved to the Trash.{' '}
            <Link to={trashPath}>Restore it from the Trash</Link> if you need it back.
          </p>
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering rules…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="world-rules-load-error">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="rulelist" data-testid="world-rule-list">
          {result.items.map((rule) => (
            <li
              className="rulerow rowlink"
              key={rule.id}
              data-testid="world-rule-row"
              data-title={rule.title}
            >
              <Link
                className="rulerow__title rowlink__target"
                to={`${basePath}/${rule.id}`}
                data-testid="world-rule-open"
              >
                <bdi>{rule.title}</bdi>
              </Link>
              {rule.excerpt ? (
                <p className="rulerow__excerpt" dir="auto" data-testid="world-rule-excerpt">
                  {rule.excerpt}
                  {rule.isExcerptShortened ? '…' : null}
                </p>
              ) : null}
              <p className="rulerow__meta">
                {rule.hasCheck ? (
                  <span className="rulerow__check" data-testid="world-rule-has-check">
                    Checked against the timeline ·{' '}
                  </span>
                ) : null}
                Updated <time dateTime={rule.updatedAt}>{formatDate(rule.updatedAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 && result.totalCount === 0 ? (
        <EmptyState
          testId="world-rules-empty"
          title="No world rules yet."
          hint="World Rules define explicit constraints for how this universe works. Each states one thing that is always true in it."
          action={
            access.editContent ? (
              <Link className="button" to={`${basePath}/new`} data-testid="empty-new-world-rule">
                <ActionIcon icon={Plus} />
                New rule
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {result && result.items.length === 0 && result.totalCount > 0 ? (
        <EmptyState
          testId="world-rules-page-empty"
          title="Nothing on this page."
          action={
            <button className="button button--secondary" type="button" onClick={() => goToPage(1)}>
              Go to the first page
            </button>
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => goToPage(result.page - 1)}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => goToPage(result.page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}
