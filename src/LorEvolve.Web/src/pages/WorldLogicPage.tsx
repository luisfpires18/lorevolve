import { useId } from 'react'
import { useOutletContext } from 'react-router-dom'
import { QueryTabList } from '../components/QueryTabs'
import { t, useI18n } from '../i18n'
import { useQueryTab } from '../lib/queryTab'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'
import { useWorldLogicState } from '../worldLogic/useWorldLogicState'
import { useWorldLogicReads } from '../worldLogic/useWorldLogicReads'
import { worldLogicActions } from '../worldLogic/worldLogicActions'
import { WorldLogicHeader } from '../components/worldLogic/WorldLogicHeader'
import { WorldLogicRules } from '../components/worldLogic/WorldLogicRules'
import { WorldLogicSystems } from '../components/worldLogic/WorldLogicSystems'
import { WorldLogicIntegrity } from '../components/worldLogic/WorldLogicIntegrity'

type View = 'rules' | 'systems' | 'integrity'

/**
 * A universe's World Logic: the rules it keeps, the Systems that group them, and what checking them found
 * (ADR 0072).
 *
 * <b>One place for both kinds of rule.</b> Rules lists the world rules that came before ADR 0072 beside the reusable
 * rule definitions that came with it, each row saying which it is. A world rule still opens in its own editor at its
 * own address, so every link an author already has keeps working and nothing was migrated out from under them.
 *
 * <b>A System is written here; a rule definition is not.</b> A System is a name and a summary, so it has an editor
 * (`SystemEditorPage`). A world rule is written in its own editor; a rule definition is written through MCP or the API,
 * or built from blocks as a transition's guard on a System's Machine tab (Issue #359). There is no page here for a rule
 * definition on its own, and pretending otherwise with a form that cannot express a condition would be worse than
 * saying so.
 *
 * <b>Integrity keeps the three outcomes apart.</b> It lists what checking the rules found, newest first. A
 * contradiction, a rule the stored facts cannot answer and a rule that is itself broken are three different things
 * and each row says which, because a finding that could not be checked is not a finding that passed.
 *
 * <b>And it is honest about an empty list.</b> No finding recorded can mean no check has run or that the last one
 * found nothing, and the page cannot tell the two apart from the store: nothing records when a sweep last ran. So an
 * empty list says both possibilities and offers the check, and only a check run from here reports a clean pass.
 *
 * The tab is in the address as `?tab=`, so Back and a reload land on the same one.
 */
export default function WorldLogicPage() {
  useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const headingId = useId()

  const tabs = [
    { id: 'rules' as View, label: t('canon.worldLogic.tabs.rules') },
    { id: 'systems' as View, label: t('canon.worldLogic.tabs.systems') },
    { id: 'integrity' as View, label: t('canon.worldLogic.tabs.integrity') },
  ] as const

  const [tab, choose] = useQueryTab<View>(tabs)

  const state = useWorldLogicState()
  const { rules, systems, findings, sweep, sweeping, sweepFailed } = state

  const base = `/app/universes/${universe.id}`
  useWorldLogicReads({ ...state, universe })
  const { goTo, retry, check, reread } = worldLogicActions({ ...state, universe })

  return (
    <section className="rules" aria-labelledby={headingId} data-testid="world-logic">
      <WorldLogicHeader headingId={headingId} access={access} tab={tab} base={base} />

      <QueryTabList
        label={t('canon.worldLogic.title')}
        idPrefix="world-logic"
        tabs={tabs}
        tab={tab}
        onChoose={choose}
      />

      <WorldLogicRules
        tab={tab}
        rules={rules}
        base={base}
        access={access}
        retry={retry}
        goTo={goTo}
      />

      <WorldLogicSystems
        tab={tab}
        systems={systems}
        universe={universe}
        retry={retry}
        goTo={goTo}
      />

      <WorldLogicIntegrity
        tab={tab}
        findings={findings}
        sweep={sweep}
        sweeping={sweeping}
        sweepFailed={sweepFailed}
        universe={universe}
        base={base}
        access={access}
        retry={retry}
        check={check}
        reread={reread}
        goTo={goTo}
      />
    </section>
  )
}
