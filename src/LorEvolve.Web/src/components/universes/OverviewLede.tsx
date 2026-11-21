import { Link } from 'react-router-dom'
import { t, tx, useI18n } from '../../i18n'
import { roleDescription, roleLabel } from '../../universes/access'
import type { UniverseDetail } from '../../universes/types'
import { DateText } from '../DateText'

/**
 * The universe front page's lede: its description (or where to write one), when it was made and changed, and, on a
 * shared universe, the reader's role.
 */
export function OverviewLede({ universe, shared }: { universe: UniverseDetail; shared: boolean }) {
  useI18n()
  return (
    <>
      {universe.description ? (
        <p className="overview__description prose">{universe.description}</p>
      ) : shared ? (
        <p className="overview__description">{t('workspace.overview.noDescription')}</p>
      ) : (
        <p className="overview__description">
          {tx('workspace.overview.noDescriptionOwn', {
            settings: <Link to="settings">{t('workspace.overview.noDescriptionSettings')}</Link>,
          })}
        </p>
      )}
      <p className="overview__meta">
        {tx('workspace.overview.dates', {
          created: <DateText value={universe.createdAt} />,
          changed: <DateText value={universe.updatedAt} />,
        })}
      </p>
      {shared ? (
        <p className="overview__meta" data-testid="overview-role">
          {t('workspace.overview.shared', {
            role: roleLabel(universe.accessRole),
            description: roleDescription(universe.accessRole),
          })}
        </p>
      ) : null}
    </>
  )
}
