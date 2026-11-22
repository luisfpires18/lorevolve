import { useId, useState } from 'react'
import { t, useI18n } from '../../i18n'
import { decideWorldLogicFinding, getWorldLogicFinding } from '../../worldLogic/api'
import type { WorldLogicFindingRow } from '../../worldLogic/types'
import { useReadOnOpen } from '../../lib/useReadOnOpen'
import { LinkRow } from '../LinkRow'
import {
  outcomeLabel,
  findingTitle,
  outcomeHint,
  statusLabel,
} from '../../worldLogic/findingLabels'
import { FindingDetail } from './FindingDetail'
import { DateText } from '../DateText'
import { DisclosurePanel } from '../DisclosurePanel'

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
  const { detail, setDetail, failed } = useReadOnOpen(open, (signal) =>
    getWorldLogicFinding(universeId, finding.id, signal),
  )
  const [deciding, setDeciding] = useState(false)
  const [decideFailed, setDecideFailed] = useState(false)
  const panelId = useId()
  const { machine } = finding

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
    <LinkRow
      look="rule"
      testId="world-logic-finding-row"
      data-outcome={finding.outcome}
      data-status={finding.status}
      data-rule={finding.ruleTitle ?? undefined}
      data-check={machine?.check}
      title={findingTitle(finding) ?? ''}
      titleTestId="world-logic-finding-toggle"
      expanded={open}
      controls={panelId}
      onToggle={() => setOpen((current) => !current)}
      excerpt={
        machine
          ? t(
              machine.check === 'undeclared_state'
                ? 'canon.worldLogic.integrity.machine.hints.undeclaredState'
                : 'canon.worldLogic.integrity.machine.hints.noTransitionHolds',
            )
          : outcomeHint(finding.outcome)
      }
      excerptDirAuto={false}
      meta={
        <>
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
            time: <DateText value={finding.createdAt} />,
          })}
        </>
      }
    >
      <DisclosurePanel
        id={panelId}
        open={open}
        loaded={!!detail}
        failed={failed}
        failedText={t('canon.worldLogic.integrity.readOneFailed')}
        loadingText={t('canon.worldLogic.integrity.loadingOne')}
        testId="world-logic-finding-detail"
      >
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
      </DisclosurePanel>
    </LinkRow>
  )
}
