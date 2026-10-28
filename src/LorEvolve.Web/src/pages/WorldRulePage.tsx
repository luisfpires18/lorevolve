import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { WorldRuleEditor } from '../components/WorldRuleEditor'
import { formatDate } from '../lib/dates'
import { useUniverseAccess } from '../universes/access'
import { getWorldRule } from '../worldRules/api'
import type { WorldRuleDetail } from '../worldRules/types'
import type { WorkspaceContext } from './UniverseWorkspace'
import type { WorldRulesListNotice } from './WorldRulesPage'

/** What the page that just created a rule says to the page that opens it. */
interface WorldRuleOpenNotice {
  created?: boolean
}

/**
 * One world rule, new or saved, at `world-rules/new` or `world-rules/:ruleId` inside a universe - an address that reloads to
 * the same rule, which is where a search result for it lands.
 */
export default function WorldRulePage({ isNew = false }: { isNew?: boolean }) {
  const { ruleId } = useParams<{ ruleId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { universe } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const listPath = `/app/universes/${universe.id}/world-rules`
  const justCreated = !isNew && (location.state as WorldRuleOpenNotice | null)?.created === true

  // Said once: the note is taken out of the history entry, so a reload does not announce the rule as just created again. The
  // address is the same, so the editor stays as it is.
  const { pathname, hash } = location
  useEffect(() => {
    if (justCreated) void navigate(`${pathname}${hash}`, { replace: true, state: null })
  }, [justCreated, navigate, pathname, hash])

  // Read, not written: a collaborator without editing sees the rule as text (ADR 0041 amendment).
  if (!access.editContent && ruleId) {
    return <WorldRuleReading universeId={universe.id} ruleId={ruleId} listPath={listPath} />
  }

  return (
    <WorldRuleEditor
      // A different rule - or the new one becoming saved - is a different editor, starting from nothing.
      key={isNew ? 'new' : ruleId}
      universeId={universe.id}
      ruleId={isNew ? null : (ruleId ?? null)}
      listPath={listPath}
      trashPath={`/app/universes/${universe.id}/trash`}
      announceOnOpen={justCreated ? 'Rule created.' : null}
      onCreated={(rule) =>
        void navigate(`${listPath}/${rule.id}`, {
          replace: true,
          state: { created: true } satisfies WorldRuleOpenNotice,
        })
      }
      onDeleted={(rule) =>
        void navigate(listPath, { state: { deleted: rule } satisfies WorldRulesListNotice })
      }
    />
  )
}

type Reading =
  | { kind: 'loading' }
  | { kind: 'ready'; rule: WorldRuleDetail }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

function WorldRuleReading({
  universeId,
  ruleId,
  listPath,
}: {
  universeId: string
  ruleId: string
  listPath: string
}) {
  const [state, setState] = useState<Reading>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    getWorldRule(universeId, ruleId, controller.signal)
      .then((rule) => setState({ kind: 'ready', rule }))
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return
        const status = (problem as { status?: number }).status
        setState(
          status === 404
            ? { kind: 'missing' }
            : {
                kind: 'error',
                message: problem instanceof Error ? problem.message : 'The rule could not be read.',
              },
        )
      })
    return () => {
      controller.abort()
    }
  }, [universeId, ruleId])

  return (
    <article className="rule" data-testid="world-rule-reading">
      <header className="rule__head">
        <Link className="rule__back" to={listPath} data-testid="world-rule-back">
          World Rules
        </Link>
        <h1 className="rule__heading" data-testid="world-rule-heading">
          {state.kind === 'ready' ? <bdi>{state.rule.title}</bdi> : 'World rule'}
        </h1>
      </header>
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Opening the rule…
        </p>
      ) : null}
      {state.kind === 'missing' ? (
        <p className="notice" data-testid="world-rule-missing">
          This rule is not here. It may have been moved to the Trash.
        </p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="notice notice--error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'ready' ? (
        <>
          {state.rule.description ? (
            <p className="rule__reading prose" data-testid="world-rule-text">
              {state.rule.description}
            </p>
          ) : (
            <p className="notice">No description.</p>
          )}
          <p className="rule__meta">Last changed {formatDate(state.rule.updatedAt)}</p>
        </>
      ) : null}
    </article>
  )
}
