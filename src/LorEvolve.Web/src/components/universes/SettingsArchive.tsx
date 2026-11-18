import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

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

  return (
    <section className="settings__section" data-testid="archive-section">
      <h2 className="settings__heading">
        {universe.isArchived
          ? t('universe.settings.restoreHeading')
          : t('universe.settings.archiveHeading')}
      </h2>
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
        <div
          className="settings__confirm"
          role="group"
          aria-labelledby="archive-confirm-title"
          tabIndex={-1}
          ref={archiveConfirm}
          data-testid="archive-public-confirm"
        >
          <p className="settings__confirmtitle" id="archive-confirm-title">
            {tx(
              isPublic
                ? 'universe.settings.archiveConfirmPublic'
                : 'universe.settings.archiveConfirm',
              { name: <bdi>{universe.name}</bdi> },
            )}
          </p>
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
            onCancel={() => {
              archiveCancelled.current = true
              setConfirmingArchive(false)
            }}
            cancelTestId="cancel-archive"
            inline
          >
            <Button tone="secondary" to={publishPath} data-testid="archive-go-private">
              {t('universe.settings.makePrivateFirst')}
            </Button>
          </FormActions>
        </div>
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
    </section>
  )
}
