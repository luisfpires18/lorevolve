import { useI18n } from '../../i18n'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useUniverseSettingsState } from '../../universes/useUniverseSettingsState'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'
import { Section } from '../Section'

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
    <Section
      title={t('universe.settings.deleteHeading')}
      titleId="danger-heading"
      testId="danger-section"
      narrow
      tone="danger"
    >
      <p className="settings__note">
        {isPublic ? t('universe.settings.deleteNotePublic') : t('universe.settings.deleteNote')}
      </p>
      <p className="settings__note" data-testid="delete-ideas-note">
        {t('universe.settings.deleteIdeasNote')}
      </p>
      {confirmingDelete ? (
        <InlineConfirm
          look="settings"
          title={tx('universe.settings.deleteConfirm', { name: <bdi>{universe.name}</bdi> })}
          panelRef={deleteConfirm}
          onKeep={() => setConfirmingDelete(false)}
          busy={busy}
        >
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
        </InlineConfirm>
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
    </Section>
  ) : (
    <p className="settings__note" data-testid="delete-needs-archive">
      {t('universe.settings.deleteNeedsArchive')}
    </p>
  )
}
