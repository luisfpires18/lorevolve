import { useI18n } from '../../i18n'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { Section } from '../Section'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

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
        <QuietNote spacing="block">{t('universe.settings.backupNote')}</QuietNote>
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
        <QuietNote spacing="block">{t('universe.settings.readableNote')}</QuietNote>
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
          <QuietNote tone="saved" role="status" testId="export-done">
            {t('universe.settings.exportSaved', { name: exportedAs })}
          </QuietNote>
        ) : null}
        {exportError ? <FormMessage testId="export-error">{exportError}</FormMessage> : null}
      </Section>

      <Section title={t('universe.settings.restore')} narrow>
        <QuietNote spacing="block">{t('universe.settings.restoreNote')}</QuietNote>
        <Button tone="secondary" to="/app?restore" data-testid="settings-restore-link">
          {t('universe.settings.restoreLink')}
        </Button>
      </Section>
    </>
  )
}
