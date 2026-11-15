import { useEffect, useId, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { t, useI18n } from '../i18n'
import { formatDate, formatDateTime } from '../lib/dates'
import { useQueryTab } from '../lib/queryTab'
import { useUniverseAccess } from '../universes/access'
import {
  decideWorldLogicFinding,
  evaluateWorldLogicFindings,
  getSystem,
  getWorldLogicFinding,
  listSystems,
  listWorldLogicFindings,
  listWorldLogicRules,
} from '../worldLogic/api'
import type {
  SystemDetail,
  SystemSummary,
  WorldLogicFindingDetail,
  WorldLogicFindingOutcome,
  WorldLogicFindingRow,
  WorldLogicFindingStatus,
  WorldLogicPage as Page,
  WorldLogicRuleRow,
  WorldLogicSweepResult,
} from '../worldLogic/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load<T> = { kind: 'loading' } | { kind: 'ready'; page: Page<T> } | { kind: 'error' }

type View = 'rules' | 'systems' | 'integrity'

/**
 * A universe's World Logic: the rules it keeps, the Systems that group them, and what checking them found
 * (ADR 0072).
 *
 * <b>One place for both kinds of rule.</b> Rules lists the world rules that came before ADR 0072 beside the reusable
 * rule definitions that came with it, each row saying which it is. A world rule still opens in its own editor at its
 * own address, so every link an author already has keeps working and nothing was migrated out from under them.
 *
 * <b>Read-only, on purpose.</b> This page shows what is there. A world rule is written in its own editor; a rule
 * definition and a System are written through MCP or the API until an editor for a condition tree exists, and
 * pretending otherwise with a form that cannot express a condition would be worse than saying so.
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
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const headingId = useId()

  const tabs = [
    { id: 'rules' as View, label: t('canon.worldLogic.tabs.rules') },
    { id: 'systems' as View, label: t('canon.worldLogic.tabs.systems') },
    { id: 'integrity' as View, label: t('canon.worldLogic.tabs.integrity') },
  ] as const

  const [tab, choose] = useQueryTab<View>(tabs)

  // Each list keeps its own page in the address, so a link lands on the page it was taken from and the two cannot
  // read each other's: both panels stay mounted, so one shared number would page the list nobody is looking at.
  const [params, setParams] = useSearchParams()
  const rulesPage = asPage(params.get('rulesPage'))
  const systemsPage = asPage(params.get('systemsPage'))
  const findingsPage = asPage(params.get('findingsPage'))

  const base = `/app/universes/${universe.id}`
  const [rules, setRules] = useState<Load<WorldLogicRuleRow>>({ kind: 'loading' })
  const [systems, setSystems] = useState<Load<SystemSummary>>({ kind: 'loading' })
  const [findings, setFindings] = useState<Load<WorldLogicFindingRow>>({ kind: 'loading' })
  const [reads, setReads] = useState(0)

  // The last check run from this page, which is the only thing that can tell "nothing found" from "nothing ran":
  // the store keeps findings, not sweeps, so a reload forgets this and the empty state says both again.
  const [sweep, setSweep] = useState<WorldLogicSweepResult | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const [sweepFailed, setSweepFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    listWorldLogicRules(universe.id, rulesPage, controller.signal)
      .then((page) => setRules({ kind: 'ready', page }))
      .catch(() => {
        if (!controller.signal.aborted) setRules({ kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, rulesPage, reads])

  useEffect(() => {
    const controller = new AbortController()

    listSystems(universe.id, systemsPage, controller.signal)
      .then((page) => setSystems({ kind: 'ready', page }))
      .catch(() => {
        if (!controller.signal.aborted) setSystems({ kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, systemsPage, reads])

  useEffect(() => {
    const controller = new AbortController()

    listWorldLogicFindings(universe.id, findingsPage, controller.signal)
      .then((page) => setFindings({ kind: 'ready', page }))
      .catch(() => {
        if (!controller.signal.aborted) setFindings({ kind: 'error' })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, findingsPage, reads])

  /** Moves one list to a page, leaving the other lists' pages and the chosen tab where they are. */
  function goTo(which: 'rulesPage' | 'systemsPage' | 'findingsPage', next: number) {
    // The list says it is loading from here, where the author asked for it, rather than from the effect that reads
    // it: a setState inside the effect would start a second render for something this event already knows.
    if (which === 'rulesPage') setRules({ kind: 'loading' })
    else if (which === 'systemsPage') setSystems({ kind: 'loading' })
    else setFindings({ kind: 'loading' })

    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next <= 1) updated.delete(which)
      else updated.set(which, String(next))
      return updated
    })
  }

  function retry() {
    setRules({ kind: 'loading' })
    setSystems({ kind: 'loading' })
    setFindings({ kind: 'loading' })
    setReads((current) => current + 1)
  }

  /**
   * Runs the check and reads the findings back. The sweep answers counts rather than rows, so the list is read again
   * afterwards; a run that found nothing is what lets the empty state say every rule passed rather than guessing.
   */
  async function check() {
    setSweeping(true)
    setSweepFailed(false)

    try {
      const result = await evaluateWorldLogicFindings(universe.id)
      setSweep(result)
      setFindings({ kind: 'loading' })
      // A new run can empty the page the author is on, so the list goes back to the first page with it.
      if (findingsPage > 1) goTo('findingsPage', 1)
      else setReads((current) => current + 1)
    } catch {
      setSweepFailed(true)
    } finally {
      setSweeping(false)
    }
  }

  /** Reads the list again after a decision, so what a row says is what the store holds. */
  function reread() {
    setReads((current) => current + 1)
  }

  return (
    <section className="rules" aria-labelledby={headingId} data-testid="world-logic">
      <PageHeader
        title={t('canon.worldLogic.title')}
        titleId={headingId}
        lede={t('canon.worldLogic.lede')}
        actions={
          access.editContent ? (
            <Link
              className="button"
              to={`${base}/world-rules/new`}
              data-testid="world-logic-new-rule"
            >
              <ActionIcon icon={Plus} />
              {t('canon.rules.newRule')}
            </Link>
          ) : undefined
        }
      />

      <QueryTabList
        label={t('canon.worldLogic.title')}
        idPrefix="world-logic"
        tabs={tabs}
        tab={tab}
        onChoose={choose}
      />

      <TabPanel idPrefix="world-logic" id="rules" tab={tab}>
        {rules.kind === 'loading' ? (
          <p className="notice" role="status">
            {t('canon.rules.loading')}
          </p>
        ) : null}

        {rules.kind === 'error' ? (
          <div className="notice notice--error" role="alert" data-testid="world-logic-rules-error">
            <p>{t('canon.rules.readFailed')}</p>
            <button className="button button--secondary" type="button" onClick={retry}>
              {t('canon.rules.retry')}
            </button>
          </div>
        ) : null}

        {rules.kind === 'ready' && rules.page.items.length > 0 ? (
          <ul className="rulelist" data-testid="world-logic-rule-list">
            {rules.page.items.map((rule) => (
              <li
                className={rule.source === 'worldRule' ? 'rulerow rowlink' : 'rulerow'}
                key={`${rule.source}-${rule.id}`}
                data-testid="world-logic-rule-row"
                data-source={rule.source}
                data-title={rule.title}
              >
                {rule.source === 'worldRule' ? (
                  <Link
                    className="rulerow__title rowlink__target"
                    to={`${base}/world-rules/${rule.id}`}
                    data-testid="world-logic-rule-open"
                  >
                    <bdi>{rule.title}</bdi>
                  </Link>
                ) : (
                  <p className="rulerow__title">
                    <bdi>{rule.title}</bdi>
                  </p>
                )}

                {rule.excerpt ? (
                  <p className="rulerow__excerpt" dir="auto">
                    {rule.excerpt}
                    {rule.isExcerptShortened ? '…' : null}
                  </p>
                ) : null}

                <p className="rulerow__meta">
                  <span className="rulerow__check" data-testid="world-logic-rule-kind">
                    {rule.source === 'worldRule'
                      ? t('canon.worldLogic.kinds.worldRule')
                      : t('canon.worldLogic.kinds.definition')}
                  </span>
                  {rule.hasCheck ? (
                    <span className="rulerow__check" data-testid="world-logic-rule-has-check">
                      {t('canon.rules.checked')}
                    </span>
                  ) : null}
                  {rule.hasCondition ? (
                    <span className="rulerow__check" data-testid="world-logic-rule-has-condition">
                      {t('canon.worldLogic.hasCondition')}
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

        {rules.kind === 'ready' && rules.page.totalCount === 0 ? (
          <EmptyState
            testId="world-logic-rules-empty"
            title={t('canon.rules.empty.title')}
            hint={t('canon.rules.empty.hint')}
            action={
              access.editContent ? (
                <Link className="button" to={`${base}/world-rules/new`}>
                  <ActionIcon icon={Plus} />
                  {t('canon.rules.newRule')}
                </Link>
              ) : undefined
            }
          />
        ) : null}

        {rules.kind === 'ready' && rules.page.items.length === 0 && rules.page.totalCount > 0 ? (
          <EmptyState
            testId="world-logic-rules-page-empty"
            title={t('canon.rules.pageEmpty.title')}
            action={
              <button
                className="button button--secondary"
                type="button"
                onClick={() => goTo('rulesPage', 1)}
              >
                {t('canon.rules.pageEmpty.first')}
              </button>
            }
          />
        ) : null}

        {rules.kind === 'ready' ? (
          <Pager
            testId="world-logic-rules-pager"
            page={rules.page.page}
            totalPages={rules.page.totalPages}
            onGo={(next) => goTo('rulesPage', next)}
          />
        ) : null}
      </TabPanel>

      <TabPanel idPrefix="world-logic" id="systems" tab={tab}>
        {systems.kind === 'loading' ? (
          <p className="notice" role="status">
            {t('canon.worldLogic.systems.loading')}
          </p>
        ) : null}

        {systems.kind === 'error' ? (
          <div
            className="notice notice--error"
            role="alert"
            data-testid="world-logic-systems-error"
          >
            <p>{t('canon.worldLogic.systems.readFailed')}</p>
            <button className="button button--secondary" type="button" onClick={retry}>
              {t('canon.rules.retry')}
            </button>
          </div>
        ) : null}

        {systems.kind === 'ready' && systems.page.items.length > 0 ? (
          <ul className="rulelist" data-testid="world-logic-system-list">
            {systems.page.items.map((system) => (
              <SystemRow key={system.id} universeId={universe.id} system={system} />
            ))}
          </ul>
        ) : null}

        {systems.kind === 'ready' && systems.page.totalCount === 0 ? (
          <EmptyState
            testId="world-logic-systems-empty"
            title={t('canon.worldLogic.systems.empty.title')}
            hint={t('canon.worldLogic.systems.empty.hint')}
          />
        ) : null}

        {systems.kind === 'ready' &&
        systems.page.items.length === 0 &&
        systems.page.totalCount > 0 ? (
          <EmptyState
            testId="world-logic-systems-page-empty"
            title={t('canon.rules.pageEmpty.title')}
            action={
              <button
                className="button button--secondary"
                type="button"
                onClick={() => goTo('systemsPage', 1)}
              >
                {t('canon.rules.pageEmpty.first')}
              </button>
            }
          />
        ) : null}

        {systems.kind === 'ready' ? (
          <Pager
            testId="world-logic-systems-pager"
            page={systems.page.page}
            totalPages={systems.page.totalPages}
            onGo={(next) => goTo('systemsPage', next)}
          />
        ) : null}
      </TabPanel>

      <TabPanel idPrefix="world-logic" id="integrity" tab={tab}>
        {/* Checking writes the findings, so it is editing (ADR 0041); everyone reads what the last check found. */}
        {access.editContent ? (
          <div className="controls">
            <button
              className="button button--secondary"
              type="button"
              disabled={sweeping}
              aria-busy={sweeping}
              onClick={() => void check()}
              data-testid="world-logic-integrity-check"
            >
              {sweeping
                ? t('canon.worldLogic.integrity.checking')
                : t('canon.worldLogic.integrity.check')}
            </button>
          </div>
        ) : null}

        {sweepFailed ? (
          <p
            className="notice notice--error"
            role="alert"
            data-testid="world-logic-integrity-check-error"
          >
            {t('canon.worldLogic.integrity.checkFailed')}
          </p>
        ) : null}

        {sweep ? (
          <p className="notice" data-testid="world-logic-integrity-checked">
            {tx('canon.worldLogic.integrity.checked', {
              time: <time dateTime={sweep.evaluatedAt}>{formatDateTime(sweep.evaluatedAt)}</time>,
            })}
          </p>
        ) : null}

        {sweep?.isTruncated ? (
          <p
            className="notice notice--error"
            role="status"
            data-testid="world-logic-integrity-truncated"
          >
            {t('canon.worldLogic.integrity.truncated')}
          </p>
        ) : null}

        {findings.kind === 'loading' ? (
          <p className="notice" role="status">
            {t('canon.worldLogic.integrity.loading')}
          </p>
        ) : null}

        {findings.kind === 'error' ? (
          <div
            className="notice notice--error"
            role="alert"
            data-testid="world-logic-findings-error"
          >
            <p>{t('canon.worldLogic.integrity.readFailed')}</p>
            <button className="button button--secondary" type="button" onClick={retry}>
              {t('canon.rules.retry')}
            </button>
          </div>
        ) : null}

        {findings.kind === 'ready' && findings.page.items.length > 0 ? (
          <ul className="rulelist" data-testid="world-logic-finding-list">
            {findings.page.items.map((finding) => (
              <FindingRow
                key={finding.id}
                universeId={universe.id}
                finding={finding}
                canDecide={access.editContent}
                onDecided={reread}
              />
            ))}
          </ul>
        ) : null}

        {findings.kind === 'ready' && findings.page.totalCount === 0 ? (
          <EmptyState
            testId={sweep ? 'world-logic-integrity-passed' : 'world-logic-integrity-empty'}
            title={
              sweep
                ? t('canon.worldLogic.integrity.passed.title')
                : t('canon.worldLogic.integrity.empty.title')
            }
            hint={
              sweep
                ? t('canon.worldLogic.integrity.passed.hint')
                : t('canon.worldLogic.integrity.empty.hint')
            }
            action={
              <Link
                className="button button--secondary"
                to={`${base}/canon`}
                data-testid="world-logic-canon-link"
              >
                {t('canon.worldLogic.integrity.canonLink')}
              </Link>
            }
          />
        ) : null}

        {findings.kind === 'ready' &&
        findings.page.items.length === 0 &&
        findings.page.totalCount > 0 ? (
          <EmptyState
            testId="world-logic-findings-page-empty"
            title={t('canon.rules.pageEmpty.title')}
            action={
              <button
                className="button button--secondary"
                type="button"
                onClick={() => goTo('findingsPage', 1)}
              >
                {t('canon.rules.pageEmpty.first')}
              </button>
            }
          />
        ) : null}

        {findings.kind === 'ready' ? (
          <Pager
            testId="world-logic-findings-pager"
            page={findings.page.page}
            totalPages={findings.page.totalPages}
            onGo={(next) => goTo('findingsPage', next)}
          />
        ) : null}
      </TabPanel>
    </section>
  )
}

/** A page number from the address: at least 1, and 1 for anything that is not a number. */
function asPage(written: string | null) {
  return Math.max(1, Number.parseInt(written ?? '1', 10) || 1)
}

/**
 * One list's pages, drawn only when there is more than one. The same shape the rule book's own pager has, so the two
 * read the same way; each list on this page has its own, because each has its own page in the address.
 */
function Pager({
  testId,
  page,
  totalPages,
  onGo,
}: {
  testId: string
  page: number
  totalPages: number
  onGo: (next: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <nav className="pager" aria-label={t('canon.rules.pagination')} data-testid={testId}>
      <button
        className="button button--secondary"
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
      >
        {t('canon.rules.previous')}
      </button>
      <span className="pager__position">{t('canon.rules.position', { page, totalPages })}</span>
      <button
        className="button button--secondary"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
      >
        {t('canon.rules.next')}
      </button>
    </nav>
  )
}

/**
 * One System, and the rule definitions it references once the author opens it.
 *
 * Its rules are read when it is opened rather than with the list, because a universe's Systems are a list of names
 * and its rules are not: reading every System's rules to draw a list of names would be most of the page's work for
 * none of its content.
 */
function SystemRow({ universeId, system }: { universeId: string; system: SystemSummary }) {
  const { tn } = useI18n()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<SystemDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open || detail) return

    const controller = new AbortController()

    getSystem(universeId, system.id, controller.signal)
      .then((read) => setDetail(read))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [open, detail, universeId, system.id])

  return (
    <li className="rulerow" data-testid="world-logic-system-row" data-name={system.name}>
      <button
        className="rulerow__title rulerow__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        data-testid="world-logic-system-toggle"
      >
        <ActionIcon icon={open ? ChevronDown : ChevronRight} />
        <bdi>{system.name}</bdi>
      </button>

      {system.excerpt ? (
        <p className="rulerow__excerpt" dir="auto">
          {system.excerpt}
          {system.isExcerptShortened ? '…' : null}
        </p>
      ) : null}

      <p className="rulerow__meta">
        <span className="rulerow__check" data-testid="world-logic-system-scope">
          {system.scope === 'Project'
            ? t('canon.worldLogic.scopes.project')
            : t('canon.worldLogic.scopes.universe')}
        </span>
        {tn('canon.worldLogic.systems.ruleCount', system.ruleCount, { count: system.ruleCount })}
      </p>

      <div id={panelId} hidden={!open} data-testid="world-logic-system-rules">
        {failed ? (
          <p className="notice notice--error" role="alert">
            {t('canon.worldLogic.systems.readFailed')}
          </p>
        ) : null}

        {open && !detail && !failed ? (
          <p className="notice" role="status">
            {t('canon.worldLogic.systems.loading')}
          </p>
        ) : null}

        {detail && detail.rules.length > 0 ? (
          <ul className="rulelist">
            {detail.rules.map((rule) => (
              <li className="rulerow" key={rule.id} data-testid="world-logic-system-rule">
                <p className="rulerow__title">
                  <bdi>{rule.title}</bdi>
                </p>
                <p className="rulerow__meta">
                  {rule.hasCondition ? (
                    <span className="rulerow__check">{t('canon.worldLogic.hasCondition')}</span>
                  ) : (
                    <span className="rulerow__check">{t('canon.worldLogic.wordsOnly')}</span>
                  )}
                  {tn('canon.worldLogic.systems.sharedWith', rule.systemCount, {
                    count: rule.systemCount,
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {detail && detail.rules.length === 0 ? (
          <p className="notice" data-testid="world-logic-system-no-rules">
            {t('canon.worldLogic.systems.noRules')}
          </p>
        ) : null}
      </div>
    </li>
  )
}

/** What the outcome means, in a word. Never a severity number: the three outcomes are three different facts. */
function outcomeLabel(outcome: WorldLogicFindingOutcome) {
  if (outcome === 'violation') return t('canon.worldLogic.integrity.outcomes.violation')
  if (outcome === 'error') return t('canon.worldLogic.integrity.outcomes.error')
  return t('canon.worldLogic.integrity.outcomes.unknown')
}

function outcomeHint(outcome: WorldLogicFindingOutcome) {
  if (outcome === 'violation') return t('canon.worldLogic.integrity.outcomeHints.violation')
  if (outcome === 'error') return t('canon.worldLogic.integrity.outcomeHints.error')
  return t('canon.worldLogic.integrity.outcomeHints.unknown')
}

function statusLabel(status: WorldLogicFindingStatus) {
  if (status === 'reviewing') return t('canon.worldLogic.integrity.statuses.reviewing')
  if (status === 'resolved') return t('canon.worldLogic.integrity.statuses.resolved')
  if (status === 'dismissed') return t('canon.worldLogic.integrity.statuses.dismissed')
  return t('canon.worldLogic.integrity.statuses.open')
}

/**
 * What one history entry was, in the reader's language. An action the server adds later has no wording here yet, so
 * it is shown as the server's own word rather than dropped: a history that hides an entry is not a history.
 */
function historyLabel(action: string) {
  switch (action) {
    case 'detected':
      return t('canon.worldLogic.integrity.actions.detected')
    case 'reopened':
      return t('canon.worldLogic.integrity.actions.reopened')
    case 'reviewed':
      return t('canon.worldLogic.integrity.actions.reviewed')
    case 'dismissed':
      return t('canon.worldLogic.integrity.actions.dismissed')
    case 'resolved':
      return t('canon.worldLogic.integrity.actions.resolved')
    case 'closed':
      return t('canon.worldLogic.integrity.actions.closed')
    default:
      return action
  }
}

/**
 * One finding: which rule produced it, what checking concluded, and, once the author opens it, the records the
 * outcome rested on, the evaluator's own trace and what has been done about it.
 *
 * The evidence is read when the row is opened rather than with the list, because the list route answers a count and
 * the detail route answers the records: reading every finding's records to draw a list would be most of the page's
 * work for none of its content.
 *
 * <b>Dismissing and taking it up again.</b> Dismissal suppresses a problem that is still there. The way back is
 * `review`, which is the only transition out of a dismissal and says the author is looking at it again. A resolved
 * finding is settled and the API refuses both, so neither verb is offered for one.
 */
function FindingRow({
  universeId,
  finding,
  canDecide,
  onDecided,
}: {
  universeId: string
  finding: WorldLogicFindingRow
  canDecide: boolean
  onDecided: () => void
}) {
  const { tn, tx } = useI18n()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<WorldLogicFindingDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [decideFailed, setDecideFailed] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open || detail) return

    const controller = new AbortController()

    getWorldLogicFinding(universeId, finding.id, controller.signal)
      .then((read) => setDetail(read))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [open, detail, universeId, finding.id])

  async function decide(decision: 'review' | 'dismiss') {
    setDeciding(true)
    setDecideFailed(false)

    try {
      setDetail(await decideWorldLogicFinding(universeId, finding.id, decision))
      onDecided()
    } catch {
      setDecideFailed(true)
    } finally {
      setDeciding(false)
    }
  }

  return (
    <li
      className="rulerow"
      data-testid="world-logic-finding-row"
      data-outcome={finding.outcome}
      data-status={finding.status}
      data-rule={finding.ruleTitle}
    >
      <button
        className="rulerow__title rulerow__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        data-testid="world-logic-finding-toggle"
      >
        <ActionIcon icon={open ? ChevronDown : ChevronRight} />
        <bdi>{finding.ruleTitle}</bdi>
      </button>

      <p className="rulerow__excerpt">{outcomeHint(finding.outcome)}</p>

      <p className="rulerow__meta">
        <span className="rulerow__check" data-testid="world-logic-finding-outcome">
          {outcomeLabel(finding.outcome)}
        </span>
        {' · '}
        <span className="rulerow__check" data-testid="world-logic-finding-status">
          {statusLabel(finding.status)}
        </span>
        {' · '}
        {finding.errorCode ? (
          <>
            <span data-testid="world-logic-finding-code">
              {t('canon.worldLogic.integrity.errorCode', { code: finding.errorCode })}
            </span>
            {' · '}
          </>
        ) : null}
        <span data-testid="world-logic-finding-evidence-count">
          {tn('canon.worldLogic.integrity.evidenceCount', finding.evidenceCount, {
            count: finding.evidenceCount,
          })}
        </span>
        {' · '}
        {tx('canon.worldLogic.integrity.found', {
          time: <time dateTime={finding.createdAt}>{formatDate(finding.createdAt)}</time>,
        })}
      </p>

      <div id={panelId} hidden={!open} data-testid="world-logic-finding-detail">
        {failed ? (
          <p className="notice notice--error" role="alert">
            {t('canon.worldLogic.integrity.readOneFailed')}
          </p>
        ) : null}

        {open && !detail && !failed ? (
          <p className="notice" role="status">
            {t('canon.worldLogic.integrity.loadingOne')}
          </p>
        ) : null}

        {detail ? (
          <>
            <p className="rulerow__meta">
              {t('canon.worldLogic.integrity.ruleVersion', { version: detail.finding.ruleVersion })}
            </p>

            <h3 className="rulerow__meta">{t('canon.worldLogic.integrity.evidence')}</h3>
            {detail.evidence.length > 0 ? (
              <ul data-testid="world-logic-finding-evidence">
                {detail.evidence.map((item) => (
                  <li key={`${item.source}-${item.id}-${item.role}`}>
                    <bdi>{`${item.source} · ${item.id} · ${item.role}`}</bdi>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice" data-testid="world-logic-finding-no-evidence">
                {t('canon.worldLogic.integrity.noEvidence')}
              </p>
            )}

            {detail.rationale.length > 0 ? (
              <>
                <h3 className="rulerow__meta">{t('canon.worldLogic.integrity.rationale')}</h3>
                <ul data-testid="world-logic-finding-rationale">
                  {detail.rationale.map((line, at) => (
                    <li key={`${at}-${line}`}>
                      <code>{line}</code>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <h3 className="rulerow__meta">{t('canon.worldLogic.integrity.history')}</h3>
            <ul data-testid="world-logic-finding-history">
              {detail.history.map((entry, at) => (
                <li key={`${at}-${entry.action}-${entry.at}`}>
                  {historyLabel(entry.action)}
                  {' · '}
                  <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                  {entry.actorId === null ? ` · ${t('canon.worldLogic.integrity.byCheck')}` : null}
                  {entry.note ? ` · ${entry.note}` : null}
                </li>
              ))}
            </ul>

            {decideFailed ? (
              <p className="notice notice--error" role="alert">
                {t('canon.worldLogic.integrity.decideFailed')}
              </p>
            ) : null}

            {canDecide && detail.finding.status !== 'resolved' ? (
              <div className="controls">
                {detail.finding.status === 'dismissed' ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={deciding}
                    aria-busy={deciding}
                    onClick={() => void decide('review')}
                    data-testid="world-logic-finding-undismiss"
                  >
                    {deciding
                      ? t('canon.worldLogic.integrity.deciding')
                      : t('canon.worldLogic.integrity.undismiss')}
                  </button>
                ) : (
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={deciding}
                    aria-busy={deciding}
                    onClick={() => void decide('dismiss')}
                    data-testid="world-logic-finding-dismiss"
                  >
                    {deciding
                      ? t('canon.worldLogic.integrity.deciding')
                      : t('canon.worldLogic.integrity.dismiss')}
                  </button>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}
