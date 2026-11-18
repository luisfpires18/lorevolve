import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

/** Settings → Advanced: the danger section with its confirm once archived, or the note that deleting needs the archive. */
export function SettingsDelete({
  universe,
  isPublic,
  busy,
  confirmingDelete,
  setConfirmingDelete,
  deleteConfirm,
  deleteButton,
  remove,
}: Pick<
  ReturnType<typeof useUniverseSettingsState>,
  | 'isPublic'
  | 'busy'
  | 'confirmingDelete'
  | 'setConfirmingDelete'
  | 'deleteConfirm'
  | 'deleteButton'
> & {
  universe: WorkspaceContext['universe']
  remove: () => Promise<void>
}) {
  const { t, tx } = useI18n()

  return universe.isArchived ? (
    <section
      className="settings__section settings__section--danger"
      aria-labelledby="danger-heading"
      data-testid="danger-section"
    >
      <h2 className="settings__heading" id="danger-heading">
        {t('universe.settings.deleteHeading')}
      </h2>
      <p className="settings__note">
        {isPublic ? t('universe.settings.deleteNotePublic') : t('universe.settings.deleteNote')}
      </p>
      <p className="settings__note" data-testid="delete-ideas-note">
        {t('universe.settings.deleteIdeasNote')}
      </p>
      {confirmingDelete ? (
        <div
          className="settings__confirm"
          role="group"
          aria-labelledby="delete-confirm-title"
          tabIndex={-1}
          ref={deleteConfirm}
        >
          <p className="settings__confirmtitle" id="delete-confirm-title">
            {tx('universe.settings.deleteConfirm', { name: <bdi>{universe.name}</bdi> })}
          </p>
          <FormActions
            submitLabel={t('universe.settings.deleteConfirmButton')}
            disabled={busy}
            submitTone="danger"
            onSubmit={remove}
            submitTestId="confirm-delete"
            onCancel={() => setConfirmingDelete(false)}
            cancelLabel={t('universe.settings.deleteKeep')}
            inline
          />
        </div>
      ) : (
        <Button
          tone="danger-quiet"
          ref={deleteButton}
          onClick={() => setConfirmingDelete(true)}
          data-testid="delete-universe"
        >
          {t('universe.settings.deleteButton')}
        </Button>
      )}
    </section>
  ) : (
    <p className="settings__note" data-testid="delete-needs-archive">
      {t('universe.settings.deleteNeedsArchive')}
    </p>
  )
}
