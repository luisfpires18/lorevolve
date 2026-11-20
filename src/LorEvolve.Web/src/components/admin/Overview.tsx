import { CardGrid } from '../CardGrid'
import type { AdminOverview } from '../../admin/api'
import { formatBytes } from '../../lib/bytes'
import { dateFormat } from '../../i18n/format'
import { useI18n } from '../../i18n'
import { NOT_TRACKED } from '../../admin/adminConstants'
import { Stat } from './Stat'
import { Section } from '../Section'
import { DateText } from '../DateText'

// ---------- Main ----------

const MONTH: Intl.DateTimeFormatOptions = {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}

export function Overview({ overview }: { overview: AdminOverview }) {
  const { t, tx } = useI18n()
  const trend = overview.universesCreatedByMonth
  const peak = Math.max(1, ...trend.map((month) => month.count))

  return (
    <>
      <Section title={t('admin.main.measured')} titleId="admin-measured" rule={false}>
        <p className="settings__note" data-testid="admin-generated">
          {tx('admin.main.counted', {
            time: <DateText value={overview.generatedAt} withTime />,
          })}
        </p>
        <CardGrid min={13} testId="admin-stats">
          <Stat
            label={t('admin.main.stats.accounts.label')}
            value={overview.accounts}
            source={t('admin.main.stats.accounts.source')}
            testId="stat-accounts"
          />
          <Stat
            label={t('admin.main.stats.admins.label')}
            value={overview.admins}
            source={t('admin.main.stats.admins.source')}
            testId="stat-admins"
          />
          <Stat
            label={t('admin.main.stats.blocked.label')}
            value={overview.blockedAccounts}
            source={t('admin.main.stats.blocked.source')}
            testId="stat-blocked"
          />
          <Stat
            label={t('admin.main.stats.universes.label')}
            value={overview.universes}
            source={t('admin.main.stats.universes.source')}
            testId="stat-universes"
          />
          <Stat
            label={t('admin.main.stats.public.label')}
            value={overview.publicUniverses}
            source={t('admin.main.stats.public.source')}
            testId="stat-public"
          />
          <Stat
            label={t('admin.main.stats.collaborations.label')}
            value={overview.collaborations}
            source={t('admin.main.stats.collaborations.source')}
            testId="stat-collaborations"
          />
          <Stat
            label={t('admin.main.stats.storage.label')}
            value={formatBytes(overview.storedImageBytes)}
            source={t('admin.main.stats.storage.source')}
            testId="stat-storage"
          />
          <Stat
            label={t('admin.main.stats.apps.label')}
            value={overview.connectedApps}
            source={t('admin.main.stats.apps.source')}
            testId="stat-apps"
          />
        </CardGrid>
      </Section>

      <Section title={t('admin.main.trend.heading')} titleId="admin-trend" rule={false}>
        <p className="settings__note">{t('admin.main.trend.note')}</p>
        <ol className="admintrend" data-testid="admin-trend">
          {trend.map((month) => (
            <li className="admintrend__row" key={`${month.year}-${month.month}`}>
              <span className="admintrend__month">
                {dateFormat(MONTH).format(new Date(Date.UTC(month.year, month.month - 1, 1)))}
              </span>
              <span className="admintrend__bar" aria-hidden="true">
                <span style={{ width: `${(month.count / peak) * 100}%` }} />
              </span>
              <span className="admintrend__count">{month.count}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t('admin.untracked.heading')} titleId="admin-untracked" rule={false}>
        <p className="settings__note">{t('admin.untracked.note')}</p>
        <CardGrid min={13} testId="admin-untracked">
          <Stat
            label={t('admin.untracked.newAccounts.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.newAccounts.source')}
            testId="stat-new-accounts"
          />
          <Stat
            label={t('admin.untracked.active.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.active.source')}
            testId="stat-active"
          />
          <Stat
            label={t('admin.untracked.requests.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.requests.source')}
            testId="stat-requests"
          />
          <Stat
            label={t('admin.untracked.ai.label')}
            value={NOT_TRACKED}
            source={t('admin.untracked.ai.source')}
            testId="stat-ai"
          />
        </CardGrid>
      </Section>
    </>
  )
}
