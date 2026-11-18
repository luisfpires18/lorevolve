import { SaveAction } from '../SaveAction'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'

/** A board editor's save bar: the warning when no recovery copy could be kept, and Save. */
export function BoardSaveBar({
  failed,
  isDirty,
  isNew,
  isSaving,
  isHeld,
  saves,
  stored,
  statusId,
  save,
}: ReturnType<typeof useBoardState> & {
  isDirty: boolean
  isHeld: boolean
  statusId: string
  save: (expectedUpdatedAt: string | null) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <div className="manuscript__bar idea__bar">
      {failed && isDirty ? (
        <p className="recovery__warning" role="status" data-testid="board-recovery-warning">
          {t('ideas.board.recoveryWarning')}
        </p>
      ) : null}
      <div className="idea__actions">
        <SaveAction
          label={isNew ? t('ideas.board.create') : t('ideas.board.save')}
          isDirty={isDirty}
          isSaving={isSaving}
          isBlocked={isHeld}
          saves={saves}
          restingStatus={
            stored.updatedAt === null ? t('ideas.board.notSavedYet') : t('ideas.board.saved')
          }
          statusId={statusId}
          statusTestId="board-status"
          testId="board-save"
          type="button"
          onSave={() => void save(stored.updatedAt)}
          keyShortcuts="Control+S Meta+S"
        />
      </div>
    </div>
  )
}
