import { useEffect, useState } from 'react'
import { getDatabaseBackups, runDatabaseBackup } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { BackupFacts } from './BackupFacts'
import { LoadError } from '../LoadError'
import { Button } from '../Button'
import { LoadingNote } from '../LoadingNote'
import { errorText } from '../../lib/errorText'

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
    <section className="adminsection" aria-labelledby="admin-backups" data-testid="admin-backups">
      <h2 className="settings__heading" id="admin-backups">
        {t('admin.backups.heading')}
      </h2>
      {state.kind === 'loading' ? <LoadingNote>{t('admin.backups.reading')}</LoadingNote> : null}
      {state.kind === 'error' ? <LoadError message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <BackupFacts status={state.value} /> : null}
      {state.kind === 'ready' && state.value.enabled && !state.value.problem ? (
        <Button
          tone="secondary"
          onClick={() => void runNow()}
          disabled={starting || running}
          data-testid="admin-backup-run"
        >
          {running ? t('admin.backups.backingUp') : t('admin.backups.runNow')}
        </Button>
      ) : null}
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  )
}
