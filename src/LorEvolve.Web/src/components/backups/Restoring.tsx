import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { ProgressBar } from '../ProgressBar'

/**
 * The restore itself happens on the server, which says nothing until it is done, so this is no percentage: a moving bar
 * and the time so far, so a long restore of a universe with many pictures reads as working rather than stuck.
 */
export function Restoring() {
  const { t, tx } = useI18n()
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    )
    return () => window.clearInterval(tick)
  }, [])

  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="restore__progress" data-testid="restore-restoring">
      <ProgressBar label={t('admin.restore.restoring.label')} state="working" />
      <p className="restore__stage">
        {tx('admin.restore.restoring.stage', {
          elapsed: <span aria-hidden="true">{elapsed}</span>,
        })}
      </p>
      <p className="restore__stage" role="status">
        {t('admin.restore.restoring.note')}
      </p>
    </div>
  )
}
