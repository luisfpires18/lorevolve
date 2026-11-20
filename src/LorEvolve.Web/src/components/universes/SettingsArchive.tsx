import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'
import { Section } from '../Section'

/** Settings → Advanced: archive or restore from the archive, with the confirm a public universe asks for. */
export function SettingsArchive({
  universe,
  publishPath,
  isPublic,
  busy,
  confirmingArchive,
  setConfirmingArchive,
  archiveConfirm,
  archiveButton,
  archiveCancelled,
  toggleArchived,
  askToArchive,
}: Pick<
  ReturnType<typeof useUniverseSettingsState>,
  | 'isPublic'
  | 'busy'
  | 'confirmingArchive'
  | 'setConfirmingArchive'
  | 'archiveConfirm'
  | 'archiveButton'
  | 'archiveCancelled'
> & {
  universe: WorkspaceContext['universe']
  publishPath: string
  toggleArchived: () => Promise<void>
  askToArchive: () => Promise<void>
}) {
  const { t, tx } = useI18n()
  // Keep, by its button or by Escape: the archive stays as it was.
  const keepArchive = () => {
    archiveCancelled.current = true
    setConfirmingArchive(false)
  }

  return (
    <Section
      title={
        universe.isArchived
          ? t('universe.settings.restoreHeading')
          : t('universe.settings.archiveHeading')
      }
      testId="archive-section"
      narrow
    >
      <p className="settings__note">
        {universe.isArchived
          ? t('universe.settings.archivedNote')
          : t('universe.settings.archiveNote')}
      </p>
      {universe.isArchived && isPublic ? (
        <p className="settings__note" data-testid="archived-still-public">
          {tx('universe.settings.stillPublic', {
            still: <strong>{t('universe.settings.stillPublicLead')}</strong>,
            link: <Link to={publishPath}>{t('universe.settings.stillPublicLink')}</Link>,
          })}
        </p>
      ) : null}
      {confirmingArchive ? (
        <InlineConfirm
          look="settings"
          title={tx(
            isPublic
              ? 'universe.settings.archiveConfirmPublic'
              : 'universe.settings.archiveConfirm',
            { name: <bdi>{universe.name}</bdi> },
          )}
          panelRef={archiveConfirm}
          onKeep={keepArchive}
          busy={busy}
          testId="archive-public-confirm"
        >
          <p className="settings__note">
            {isPublic
              ? t('universe.settings.archiveConfirmPublicNote')
              : t('universe.settings.archiveConfirmUnknownNote')}
          </p>
          <FormActions
            submitLabel={
              isPublic
                ? t('universe.settings.archiveKeepPublic')
                : t('universe.settings.archiveConfirmButton')
            }
            busy={busy}
            busyLabel={t('universe.settings.archiving')}
            onSubmit={() => void toggleArchived()}
            submitTestId="confirm-archive"
            onCancel={keepArchive}
            cancelTestId="cancel-archive"
            inline
          >
            <Button tone="secondary" to={publishPath} data-testid="archive-go-private">
              {t('universe.settings.makePrivateFirst')}
            </Button>
          </FormActions>
        </InlineConfirm>
      ) : (
        <Button
          tone="secondary"
          ref={archiveButton}
          onClick={() => void askToArchive()}
          disabled={busy}
          data-testid="toggle-archive"
        >
          {universe.isArchived
            ? t('universe.settings.restoreUniverse')
            : t('universe.settings.archiveUniverse')}
        </Button>
      )}
    </Section>
  )
}
