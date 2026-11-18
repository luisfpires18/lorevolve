import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { EditConflict, LatestText } from '../EditConflict'
import { plainMentions } from '../../lore/mentions'
import { RecoveredDraft } from '../RecoveredDraft'
import { getSceneManuscript } from '../../stories/api'
import type { SceneManuscript } from '../../stories/types'
import type { useManuscriptState } from '../../stories/useManuscriptState'

/** The recovery offer, the conflict with the latest saved prose, and a failed save. */
export function ManuscriptNotices({
  sceneId,
  recoveryId,
  stored,
  failure,
  conflict,
  offer,
  access,
  keepMine,
  takeLatest,
  recoverDraft,
  discardDraft,
  universeId,
  storyId,
}: ReturnType<typeof useManuscriptState> & {
  universeId: string
  storyId: string
  access: ReturnType<typeof useUniverseAccess>
  offer: NonNullable<ReturnType<typeof useManuscriptState>['found']> | null
  keepMine: (latest: SceneManuscript) => void
  takeLatest: () => void
  recoverDraft: () => void
  discardDraft: () => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.

  return (
    <>
      {offer && access.editContent ? (
        <div id={recoveryId} className="manuscript__recovery">
          <RecoveredDraft
            what={t('manuscript.editor.recoveredWhat')}
            draft={offer}
            savedUpdatedAt={stored.updatedAt}
            preview={
              offer.content === '' ? (
                <p className="entry__blank">{t('manuscript.editor.draftEmpty')}</p>
              ) : (
                <div
                  className="recovery__prose prose"
                  role="region"
                  aria-label={t('manuscript.editor.draftText')}
                  tabIndex={0}
                >
                  {plainMentions(offer.content)}
                </div>
              )
            }
            onRecover={recoverDraft}
            onDiscard={discardDraft}
            testId="manuscript-recovery"
          />
        </div>
      ) : null}

      {conflict ? (
        <div className="manuscript__conflict">
          <EditConflict
            what={t('manuscript.editor.conflictWhat')}
            read={() => getSceneManuscript(universeId, storyId, sceneId)}
            renderLatest={(latest) => (
              <LatestText label={t('manuscript.editor.latestLabel')}>
                {latest.content === '' ? (
                  <p className="entry__blank">{t('manuscript.editor.latestEmpty')}</p>
                ) : (
                  <div className="recovery__prose prose" dir="auto">
                    {plainMentions(latest.content)}
                  </div>
                )}
              </LatestText>
            )}
            onKeepMine={keepMine}
            onUseLatest={takeLatest}
            testId="manuscript-conflict"
          />
        </div>
      ) : null}

      {failure ? (
        <p
          className="form__message manuscript__failure"
          role="alert"
          data-testid="manuscript-error"
        >
          {failure}
        </p>
      ) : null}
    </>
  )
}
