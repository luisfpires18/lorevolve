import { RecoveredDraft } from '../RecoveredDraft'
import type { Fields, Stored } from '../../ideas/ideaDraft'
import type { useIdeaDraft } from '../../ideas/useIdeaDraft'
import { useI18n } from '../../i18n'

/** An idea editor's notices: the recovery copy offered, the stale-save choice, and why a save failed. */
export function IdeaNotices({
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
}: {
  offer: ReturnType<typeof useIdeaDraft>['offer']
  copy: Fields | null
  recoveryId: string
  isNew: boolean
  stored: Stored
  recoverDraft: () => void
  discardDraft: () => void
  conflict: { updatedAt: string | null } | null
  isSaving: boolean
  save: (expectedUpdatedAt: string | null) => Promise<void>
  loadSavedVersion: () => Promise<void>
  failure: string | null
}) {
  const { t } = useI18n()
  return (
    <>
      {offer && copy ? (
        <div id={recoveryId}>
          <RecoveredDraft
            what={isNew ? t('ideas.editor.recoveryNew') : t('ideas.editor.recoveryThis')}
            draft={offer}
            savedUpdatedAt={stored.updatedAt}
            preview={
              <div
                className="recovery__prose idea__preview prose"
                role="region"
                aria-label={t('ideas.editor.recoveredDraft')}
                tabIndex={0}
              >
                <p className="idea__previewtitle">{copy.title || t('ideas.editor.untitled')}</p>
                {copy.body === '' ? (
                  <p className="entry__blank">{t('ideas.editor.noBody')}</p>
                ) : (
                  copy.body
                )}
              </div>
            }
            onRecover={recoverDraft}
            onDiscard={discardDraft}
            testId="idea-recovery"
          />
        </div>
      ) : null}

      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="idea-conflict">
          <p className="manuscript__conflicttext">{t('ideas.editor.conflict.text')}</p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={() => void save(conflict.updatedAt)}
              data-testid="idea-keep-mine"
            >
              {t('ideas.editor.conflict.keepMine')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={loadSavedVersion}
              data-testid="idea-load-saved"
            >
              {t('ideas.editor.conflict.loadSaved')}
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message idea__failure" role="alert" data-testid="idea-error">
          {failure}
        </p>
      ) : null}
    </>
  )
}
