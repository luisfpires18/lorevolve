import { useEffect, useState } from 'react'
import { getDatabaseBackups, runDatabaseBackup } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { BackupFacts } from './BackupFacts'
import { Button } from '../Button'
import { ReadGate } from '../ReadGate'
import { errorText } from '../../lib/errorText'
import { Section } from '../Section'
import { FormMessage } from '../FormMessage'

/**
 * Database backups (#54): the age of the last backup that was uploaded and read back, the last attempt and its error, and
 * Run now. While one runs, the status is read again every few seconds until it ends.
 */
export function DatabaseBackups() {
  const { t } = useI18n()
  const { load: state, setLoad: setState, retry, refresh } = useAsyncRead(getDatabaseBackups)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const running = state.kind === 'ready' && state.value.running

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(refresh, 3000)
    return () => window.clearTimeout(timer)
  }, [running, state, refresh])

  async function runNow() {
    setStarting(true)
    setMessage(null)
    try {
      setState({ kind: 'ready', value: await runDatabaseBackup() })
    } catch (error: unknown) {
      setMessage(errorText(error, t('admin.backups.startFailed')))
    } finally {
      setStarting(false)
    }
  }

  return (
    <Section
      title={t('admin.backups.heading')}
      titleId="admin-backups"
      testId="admin-backups"
      rule={false}
    >
      <ReadGate
        load={state}
        loading={{ text: t('admin.backups.reading') }}
        error={{ onRetry: retry }}
      >
        {(status) => (
          <>
            <BackupFacts status={status} />
            {status.enabled && !status.problem ? (
              <Button
                tone="secondary"
                onClick={() => void runNow()}
                disabled={starting || running}
                data-testid="admin-backup-run"
              >
                {running ? t('admin.backups.backingUp') : t('admin.backups.runNow')}
              </Button>
            ) : null}
          </>
        )}
      </ReadGate>
      {message ? <FormMessage>{message}</FormMessage> : null}
    </Section>
  )
}
