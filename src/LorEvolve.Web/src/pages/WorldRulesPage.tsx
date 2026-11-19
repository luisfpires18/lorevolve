import { useCallback, useId } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { Quoted } from '../components/NameList'
import { t, useI18n } from '../i18n'
import { formatDate } from '../lib/dates'
import { listWorldRules } from '../worldRules/api'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { Button } from '../components/Button'
import { Pager } from '../components/Pager'
import { NewButton } from '../components/NewButton'
import { LoadError } from '../components/LoadError'
import { LoadingNote } from '../components/LoadingNote'
import { OutcomeNotice } from '../components/OutcomeNotice'
import { useAsyncRead } from '../lib/useAsyncRead'

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
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const basePath = `/app/universes/${universe.id}/world-rules`
  const trashPath = `/app/universes/${universe.id}/trash`

  const read = useCallback(
    (signal: AbortSignal) => listWorldRules(universe.id, page, signal),
    [universe.id, page],
  )
  const { load: state, retry } = useAsyncRead(read)

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as WorldRulesListNotice | null)?.deleted ?? null

  function goToPage(next: number) {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next <= 1) updated.delete('page')
      else updated.set('page', String(next))
      return updated
    })
  }

  const result = state.kind === 'ready' ? state.value : null

  return (
    <section className="rules" aria-labelledby={headingId} data-testid="world-rules">
      <PageHeader
        title={t('canon.rules.title')}
        titleId={headingId}
        lede={t('canon.rules.lede')}
        actions={
          access.editContent ? (
            <NewButton to={`${basePath}/new`} data-testid="new-world-rule">
              {t('canon.rules.newRule')}
            </NewButton>
          ) : undefined
        }
      />

      {notice ? (
        <OutcomeNotice className="rules__notice" testId="world-rules-deleted-notice">
          {tx('canon.rules.deleted', {
            title: <Quoted text={notice.title} />,
            restore: <Link to={trashPath}>{t('canon.rules.restoreLink')}</Link>,
          })}
        </OutcomeNotice>
      ) : null}

      {state.kind === 'loading' ? <LoadingNote>{t('canon.rules.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError
          message={t('canon.rules.readFailed')}
          onRetry={retry}
          retryLabel={t('canon.rules.retry')}
          testId="world-rules-load-error"
        />
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
                    {t('canon.rules.checked')}
                  </span>
                ) : null}
                {tx('canon.rules.updated', {
                  time: <time dateTime={rule.updatedAt}>{formatDate(rule.updatedAt)}</time>,
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 && result.totalCount === 0 ? (
        <EmptyState
          testId="world-rules-empty"
          title={t('canon.rules.empty.title')}
          hint={t('canon.rules.empty.hint')}
          action={
            access.editContent ? (
              <NewButton to={`${basePath}/new`} data-testid="empty-new-world-rule">
                {t('canon.rules.emptyNewRule')}
              </NewButton>
            ) : undefined
          }
        />
      ) : null}

      {result && result.items.length === 0 && result.totalCount > 0 ? (
        <EmptyState
          testId="world-rules-page-empty"
          title={t('canon.rules.pageEmpty.title')}
          action={
            <Button tone="secondary" onClick={() => goToPage(1)}>
              {t('canon.rules.pageEmpty.first')}
            </Button>
          }
        />
      ) : null}

      {result ? (
        <Pager page={result.page} totalPages={result.totalPages} onPage={goToPage} />
      ) : null}
    </section>
  )
}
