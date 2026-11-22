import { useEffect } from 'react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { WorldRuleEditor } from '../components/WorldRuleEditor'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'
import type { WorldRulesListNotice } from './WorldRulesPage'
import { WorldRuleReading } from '../components/worldRules/WorldRuleReading'

/** What the page that just created a rule says to the page that opens it. */
interface WorldRuleOpenNotice {
  created?: boolean
}

/**
 * One world rule, new or saved, at `world-rules/new` or `world-rules/:ruleId` inside a universe - an address that reloads to
 * the same rule, which is where a search result for it lands.
 */
export default function WorldRulePage({ isNew = false }: { isNew?: boolean }) {
  useI18n() // re-renders when the language changes
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
      announceOnOpen={justCreated ? t('canon.rule.created') : null}
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
