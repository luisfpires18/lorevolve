import { Link } from 'react-router-dom'
import type { Chronology } from '../../chronology/types'
import { t, tn, useI18n } from '../../i18n'
import { joinAnd } from '../../chronology/eraDrafts'

/** The line saying how many dates sit outside every period, with a link to the Timeline when moments do. */
export function ChronologyUnplaced({
  universeId,
  stored,
  storedNamesEras,
  unplacedTotal,
  unplacedParts,
}: {
  universeId: string
  stored: Chronology
  storedNamesEras: boolean
  unplacedTotal: number
  unplacedParts: string[]
}) {
  useI18n()
  return (
    <p className="callout callout--warning settings__caution" data-testid="chronology-unplaced">
      {storedNamesEras ? (
        <>
          <strong>{tn('time.periods.unplaced.lead', unplacedTotal, { n: unplacedTotal })}</strong>{' '}
          {tn('time.periods.unplaced.rest', unplacedTotal, { list: joinAnd(unplacedParts) })}
        </>
      ) : (
        <>
          <strong>{tn('time.periods.plainYear.lead', unplacedTotal, { n: unplacedTotal })}</strong>{' '}
          {tn('time.periods.plainYear.rest', unplacedTotal, { list: joinAnd(unplacedParts) })}
        </>
      )}
      {stored.unplacedMomentCount > 0 ? (
        <>
          {' '}
          <Link to={`/app/universes/${universeId}/timeline`} data-testid="chronology-unplaced-link">
            {t('time.periods.openTimeline')}
          </Link>
        </>
      ) : null}
    </p>
  )
}
