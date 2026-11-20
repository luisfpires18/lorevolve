import { CardGrid } from '../CardGrid'
import type { DatabaseBackupStatus } from '../../admin/api'
import { formatBytes } from '../../lib/bytes'
import { useI18n } from '../../i18n'
import { Stat } from './Stat'
import { DateText } from '../DateText'
import { QuietNote } from '../QuietNote'
import { Callout } from '../Callout'

const OUTCOME_KEYS = {
  Running: 'admin.backups.outcome.running',
  Succeeded: 'admin.backups.outcome.succeeded',
  Failed: 'admin.backups.outcome.failed',
} as const

export function BackupFacts({ status }: { status: DatabaseBackupStatus }) {
  const { t } = useI18n()

  if (!status.enabled) {
    return (
      <QuietNote spacing="block" testId="admin-backups-off">
        {t('admin.backups.off')}
      </QuietNote>
    )
  }

  if (status.problem) {
    return (
      <Callout look="notice" tone="error" as="p" role="alert" testId="admin-backups-problem">
        {status.problem}
      </Callout>
    )
  }

  const last = status.lastAttempt
  return (
    <CardGrid min={13} testId="admin-backup-facts">
      <Stat
        label={t('admin.backups.lastVerified.label')}
        value={
          status.lastVerified ? (
            <DateText value={status.lastVerified.createdAt} withTime />
          ) : (
            t('admin.backups.lastVerified.none')
          )
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
          last?.error ? (
            t('admin.backups.attempt.failures', {
              error: last.error,
              count: status.consecutiveFailures,
            })
          ) : last ? (
            <DateText value={last.startedAt} withTime />
          ) : (
            t('admin.backups.attempt.schedule')
          )
        }
        testId="stat-backup-attempt"
      />
    </CardGrid>
  )
}
