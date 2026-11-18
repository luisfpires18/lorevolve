import { SaveAction } from '../SaveAction'
import type { Stored } from '../../ideas/ideaDraft'
import { useI18n } from '../../i18n'

/** An idea editor's save bar: the warning when no recovery copy could be kept, and Save. */
export function IdeaSaveBar({
  failed,
  isDirty,
  isNew,
  isSaving,
  isTooLong,
  isHeld,
  saves,
  stored,
  statusId,
}: {
  failed: boolean
  isDirty: boolean
  isNew: boolean
  isSaving: boolean
  isTooLong: boolean
  isHeld: boolean
  saves: number
  stored: Stored
  statusId: string
}) {
  const { t } = useI18n()
  return (
    <div className="manuscript__bar idea__bar">
      {failed && isDirty ? (
        <p className="recovery__warning" role="status" data-testid="idea-recovery-warning">
          {t('ideas.editor.recoveryWarning')}
        </p>
      ) : null}
      <div className="idea__actions">
        <SaveAction
          label={isNew ? t('ideas.editor.create') : t('ideas.editor.save')}
          isDirty={isDirty}
          isSaving={isSaving}
          isBlocked={isTooLong || isHeld}
          saves={saves}
          restingStatus={
            stored.updatedAt === null ? t('ideas.editor.notSavedYet') : t('ideas.editor.saved')
          }
          statusId={statusId}
          statusTestId="idea-status"
          testId="idea-save"
          keyShortcuts="Control+S Meta+S"
        />
      </div>
    </div>
  )
}
