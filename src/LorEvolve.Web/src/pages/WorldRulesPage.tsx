import { useCallback, useId } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { Quoted } from '../components/NameList'
import { t, useI18n } from '../i18n'
import { listWorldRules } from '../worldRules/api'
import { PageHeader } from '../components/PageHeader'
import type { WorkspaceContext } from './UniverseWorkspace'
import { NewButton } from '../components/NewButton'
import { ReadGate } from '../components/ReadGate'
import { WorldRulesList } from '../components/worldRules/WorldRulesList'
import { StatusNotice } from '../components/Callout'
import { useAsyncRead } from '../lib/useAsyncRead'
import { pageParam } from '../lib/queryParams'

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
    setParams((current) => pageParam(current, 'page', next))
  }

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
        <StatusNotice className="rules__notice" testId="world-rules-deleted-notice">
          {tx('canon.rules.deleted', {
            title: <Quoted text={notice.title} />,
            restore: <Link to={trashPath}>{t('canon.rules.restoreLink')}</Link>,
          })}
        </StatusNotice>
      ) : null}

      <ReadGate
        load={state}
        loading={{ text: t('canon.rules.loading') }}
        error={{
          message: t('canon.rules.readFailed'),
          onRetry: retry,
          retryLabel: t('canon.rules.retry'),
          testId: 'world-rules-load-error',
        }}
      >
        {(result) => (
          <WorldRulesList
            result={result}
            basePath={basePath}
            canCreate={access.editContent}
            onPage={goToPage}
          />
        )}
      </ReadGate>
    </section>
  )
}
