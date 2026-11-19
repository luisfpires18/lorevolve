import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { t, useI18n } from '../../i18n'
import { formatDate } from '../../lib/dates'
import { decideWorldLogicFinding, getWorldLogicFinding } from '../../worldLogic/api'
import type { WorldLogicFindingDetail, WorldLogicFindingRow } from '../../worldLogic/types'
import {
  outcomeLabel,
  findingTitle,
  outcomeHint,
  statusLabel,
} from '../../worldLogic/findingLabels'
import { FindingDetail } from './FindingDetail'
import { LoadingNote } from '../LoadingNote'

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
 *
 * <b>Resolving.</b> An open or reviewing finding, of a rule or a machine, can be marked fixed (#360). A machine
 * finding names its System, state and entry instead of a rule, and has no rule to link to.
 */
export function FindingRow({
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
  const { machine } = finding

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

  async function decide(decision: 'review' | 'dismiss' | 'resolve') {
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
      data-rule={finding.ruleTitle ?? undefined}
      data-check={machine?.check}
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
        <bdi>{findingTitle(finding)}</bdi>
      </button>

      <p className="rulerow__excerpt">
        {machine
          ? t(
              machine.check === 'undeclared_state'
                ? 'canon.worldLogic.integrity.machine.hints.undeclaredState'
                : 'canon.worldLogic.integrity.machine.hints.noTransitionHolds',
            )
          : outcomeHint(finding.outcome)}
      </p>

      <p className="rulerow__meta">
        <span className="rulerow__check" data-testid="world-logic-finding-outcome">
          {outcomeLabel(finding.outcome)}
        </span>
        {' · '}
        <span className="rulerow__check" data-testid="world-logic-finding-status">
          {statusLabel(finding.status)}
        </span>
        {' · '}
        {machine?.subjectName ? (
          <>
            <bdi data-testid="world-logic-finding-entry">
              {t('canon.worldLogic.integrity.machine.entry', { name: machine.subjectName })}
            </bdi>
            {' · '}
          </>
        ) : null}
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
          <LoadingNote>{t('canon.worldLogic.integrity.loadingOne')}</LoadingNote>
        ) : null}

        {detail ? (
          <FindingDetail
            detail={detail}
            machine={machine}
            canDecide={canDecide}
            deciding={deciding}
            decideFailed={decideFailed}
            decide={decide}
          />
        ) : null}
      </div>
    </li>
  )
}
