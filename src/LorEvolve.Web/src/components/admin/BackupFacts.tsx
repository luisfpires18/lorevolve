import type { DatabaseBackupStatus } from '../../admin/api'
import { formatBytes } from '../../lib/bytes'
import { formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'
import { Stat } from './Stat'

const OUTCOME_KEYS = {
  Running: 'admin.backups.outcome.running',
  Succeeded: 'admin.backups.outcome.succeeded',
  Failed: 'admin.backups.outcome.failed',
} as const

export function BackupFacts({ status }: { status: DatabaseBackupStatus }) {
  const { t } = useI18n()

  if (!status.enabled) {
    return (
      <p className="settings__note" data-testid="admin-backups-off">
        {t('admin.backups.off')}
      </p>
    )
  }

  if (status.problem) {
    return (
      <p className="notice notice--error" role="alert" data-testid="admin-backups-problem">
        {status.problem}
      </p>
    )
  }

  const last = status.lastAttempt
  return (
    <ul className="adminstats" data-testid="admin-backup-facts">
      <Stat
        label={t('admin.backups.lastVerified.label')}
        value={
          status.lastVerified
            ? formatDateTime(status.lastVerified.createdAt)
            : t('admin.backups.lastVerified.none')
        }
        source={
          status.stale
            ? t('admin.backups.lastVerified.stale', { hours: status.intervalHours })
            : t(
                status.automatic
                  ? 'admin.backups.lastVerified.fresh'
                  : 'admin.backups.lastVerified.freshManual',
                { hours: status.intervalHours },
              )
        }
        testId="stat-backup-last"
      />
      <Stat
        label={t('admin.backups.kept.label')}
        value={t('admin.backups.kept.value', {
          verified: status.verifiedCount,
          size: formatBytes(status.storedBytes),
        })}
        source={t(
          status.pruneEnabled ? 'admin.backups.kept.pruningOn' : 'admin.backups.kept.pruningOff',
          { environment: String(status.environment), store: String(status.store) },
        )}
        testId="stat-backup-kept"
      />
      <Stat
        label={t('admin.backups.attempt.label')}
        value={last ? t(OUTCOME_KEYS[last.outcome]) : t('admin.backups.attempt.none')}
        source={
          last?.error
            ? t('admin.backups.attempt.failures', {
                error: last.error,
                count: status.consecutiveFailures,
              })
            : last
              ? formatDateTime(last.startedAt)
              : t('admin.backups.attempt.schedule')
        }
        testId="stat-backup-attempt"
      />
    </ul>
  )
}
