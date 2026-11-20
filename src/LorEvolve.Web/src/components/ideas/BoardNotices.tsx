import { RecoveredDraft } from '../RecoveredDraft'
import type { Fields } from '../../ideas/boardDraft'
import type { useDraftedEditor } from '../../lib/useDraftedEditor'
import type { useBoardState } from '../../ideas/useBoardState'
import { useI18n } from '../../i18n'
import { ConflictBar } from '../ConflictBar'

/** A board editor's notices: the recovery copy offered, the stale-save choice, and why a save failed. */
export function BoardNotices({
  offer,
  copy,
  recoveryId,
  isNew,
  stored,
  recoverDraft,
  discardDraft,
  conflict,
  isSaving,
  save,
  loadSavedVersion,
  failure,
}: ReturnType<typeof useBoardState> & {
  offer: ReturnType<typeof useDraftedEditor<Fields>>['offer']
  copy: Fields | null
  recoveryId: string
  recoverDraft: () => void
  discardDraft: () => void
  save: (expectedUpdatedAt: string | null) => Promise<void>
  loadSavedVersion: () => Promise<void>
}) {
  const { t, tn } = useI18n()
  return (
    <>
      {offer && copy ? (
        <div id={recoveryId}>
          <RecoveredDraft
            what={isNew ? t('ideas.board.recoveryNew') : t('ideas.board.recoveryThis')}
            draft={offer}
            savedUpdatedAt={stored.updatedAt}
            preview={
              <div
                className="recovery__prose idea__preview prose"
                role="region"
                aria-label={t('ideas.board.recoveredDraft')}
                tabIndex={0}
              >
                <p className="idea__previewtitle">{copy.title || t('ideas.board.untitled')}</p>
                <p>
                  {t('ideas.board.countsStop', {
                    cards: tn('ideas.board.cards', copy.cards.length),
                    lines: tn('ideas.board.lines', copy.connections.length),
                  })}
                </p>
              </div>
            }
            onRecover={recoverDraft}
            onDiscard={discardDraft}
            testId="board-recovery"
          />
        </div>
      ) : null}

      {conflict ? (
        <ConflictBar
          text={t('ideas.board.conflict.text')}
          onKeepMine={() => void save(conflict.updatedAt)}
          keepLabel={t('ideas.board.conflict.keepMine')}
          onLoadSaved={() => void loadSavedVersion()}
          loadLabel={t('ideas.board.conflict.loadSaved')}
          busy={isSaving}
          testId="board"
        />
      ) : null}

      {failure ? (
        <p className="form__message idea__failure" role="alert" data-testid="board-error">
          {failure}
        </p>
      ) : null}
    </>
  )
}
