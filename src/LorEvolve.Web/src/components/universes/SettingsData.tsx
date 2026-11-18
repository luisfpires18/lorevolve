import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'

/** Settings → Data: the backup and readable downloads, and the way to restore a backup. */
export function SettingsData({
  exporting,
  exportedAs,
  exportError,
  exportFile,
}: Pick<ReturnType<typeof useUniverseSettingsState>, 'exporting' | 'exportedAs' | 'exportError'> & {
  exportFile: (kind: 'backup' | 'readable') => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <>
      <section className="settings__section">
        <h2 className="settings__heading">{t('universe.settings.backup')}</h2>
        <p className="settings__note">{t('universe.settings.backupNote')}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void exportFile('backup')}
          disabled={exporting !== null}
          data-testid="export-universe"
        >
          {exporting === 'backup'
            ? t('universe.settings.backupPreparing')
            : t('universe.settings.backupDownload')}
        </button>
        <p className="settings__note">{t('universe.settings.readableNote')}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void exportFile('readable')}
          disabled={exporting !== null}
          data-testid="export-readable"
        >
          {exporting === 'readable'
            ? t('universe.settings.readablePreparing')
            : t('universe.settings.readableDownload')}
        </button>
        {exportedAs ? (
          <p className="settings__saved" role="status" data-testid="export-done">
            {t('universe.settings.exportSaved', { name: exportedAs })}
          </p>
        ) : null}
        {exportError ? (
          <p className="form__message" role="alert" data-testid="export-error">
            {exportError}
          </p>
        ) : null}
      </section>

      <section className="settings__section">
        <h2 className="settings__heading">{t('universe.settings.restore')}</h2>
        <p className="settings__note">{t('universe.settings.restoreNote')}</p>
        <Link
          className="button button--secondary"
          to="/app?restore"
          data-testid="settings-restore-link"
        >
          {t('universe.settings.restoreLink')}
        </Link>
      </section>
    </>
  )
}
