import { useI18n } from '../../i18n'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { Section } from '../Section'

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
      <Section title={t('universe.settings.backup')} narrow>
        <p className="settings__note">{t('universe.settings.backupNote')}</p>
        <Button
          tone="secondary"
          onClick={() => void exportFile('backup')}
          disabled={exporting !== null}
          data-testid="export-universe"
        >
          {exporting === 'backup'
            ? t('universe.settings.backupPreparing')
            : t('universe.settings.backupDownload')}
        </Button>
        <p className="settings__note">{t('universe.settings.readableNote')}</p>
        <Button
          tone="secondary"
          onClick={() => void exportFile('readable')}
          disabled={exporting !== null}
          data-testid="export-readable"
        >
          {exporting === 'readable'
            ? t('universe.settings.readablePreparing')
            : t('universe.settings.readableDownload')}
        </Button>
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
      </Section>

      <Section title={t('universe.settings.restore')} narrow>
        <p className="settings__note">{t('universe.settings.restoreNote')}</p>
        <Button tone="secondary" to="/app?restore" data-testid="settings-restore-link">
          {t('universe.settings.restoreLink')}
        </Button>
      </Section>
    </>
  )
}
