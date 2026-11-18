import { useEffect, useState } from 'react'
import { getDatabaseBackups, runDatabaseBackup } from '../../admin/api'
import { useI18n } from '../../i18n'
import { useLoad } from '../../admin/useLoad'
import { BackupFacts } from './BackupFacts'
import { Failure } from './Failure'

/**
 * Database backups (#54): the age of the last backup that was uploaded and read back, the last attempt and its error, and
 * Run now. While one runs, the status is read again every few seconds until it ends.
 */
export function DatabaseBackups() {
  const { t } = useI18n()
  const { state, setState, retry } = useLoad(getDatabaseBackups)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const running = state.kind === 'ready' && state.value.running

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(retry, 3000)
    return () => window.clearTimeout(timer)
  }, [running, state, retry])

  async function runNow() {
    setStarting(true)
    setMessage(null)
    try {
      setState({ kind: 'ready', value: await runDatabaseBackup() })
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : t('admin.backups.startFailed'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-backups" data-testid="admin-backups">
      <h2 className="settings__heading" id="admin-backups">
        {t('admin.backups.heading')}
      </h2>
      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('admin.backups.reading')}
        </p>
      ) : null}
      {state.kind === 'error' ? <Failure message={state.message} onRetry={retry} /> : null}
      {state.kind === 'ready' ? <BackupFacts status={state.value} /> : null}
      {state.kind === 'ready' && state.value.enabled && !state.value.problem ? (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void runNow()}
          disabled={starting || running}
          data-testid="admin-backup-run"
        >
          {running ? t('admin.backups.backingUp') : t('admin.backups.runNow')}
        </button>
      ) : null}
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  )
}
