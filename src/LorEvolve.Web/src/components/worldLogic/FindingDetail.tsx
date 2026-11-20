import { t } from '../../i18n'
import type { WorldLogicFindingDetail, WorldLogicFindingRow } from '../../worldLogic/types'
import { historyLabel } from '../../worldLogic/findingLabels'
import { Button } from '../Button'
import { DateText } from '../DateText'

/** An opened finding: the version it was checked at, its evidence, the rationale, its history and the decisions. */
export function FindingDetail({
  detail,
  machine,
  canDecide,
  deciding,
  decideFailed,
  decide,
}: {
  detail: WorldLogicFindingDetail
  machine: WorldLogicFindingRow['machine']
  canDecide: boolean
  deciding: boolean
  decideFailed: boolean
  decide: (decision: 'review' | 'dismiss' | 'resolve') => Promise<void>
}) {
  return (
    <>
      <p className="rulerow__meta" data-testid="world-logic-finding-version">
        {/* A machine finding's version is its System's. */}
        {machine
          ? t('canon.worldLogic.integrity.machine.systemVersion', {
              version: detail.finding.ruleVersion,
            })
          : t('canon.worldLogic.integrity.ruleVersion', {
              version: detail.finding.ruleVersion,
            })}
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
            <DateText value={entry.at} withTime />
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
            <Button
              tone="secondary"
              busy={deciding}
              busyLabel={t('canon.worldLogic.integrity.deciding')}
              onClick={() => void decide('review')}
              data-testid="world-logic-finding-undismiss"
            >
              {t('canon.worldLogic.integrity.undismiss')}
            </Button>
          ) : (
            <div className="actions form__actions">
              <Button
                tone="secondary"
                busy={deciding}
                busyLabel={t('canon.worldLogic.integrity.deciding')}
                onClick={() => void decide('resolve')}
                data-testid="world-logic-finding-resolve"
              >
                {t('canon.worldLogic.integrity.resolve')}
              </Button>
              <Button
                tone="secondary"
                busy={deciding}
                busyLabel={t('canon.worldLogic.integrity.deciding')}
                onClick={() => void decide('dismiss')}
                data-testid="world-logic-finding-dismiss"
              >
                {t('canon.worldLogic.integrity.dismiss')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}
