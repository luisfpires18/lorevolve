import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { MentionProse } from '../MentionProse'
import { ManuscriptWriter } from '../ManuscriptWriter'
import { NameLinker } from '../NameLinker'
import type { Scene } from '../../stories/types'
import type { useManuscriptState } from '../../stories/useManuscriptState'

/** Write or Read, the name linker, and the writer. */
export function ManuscriptBody({
  draft,
  setDraft,
  isReading,
  setIsReading,
  isLinking,
  setIsLinking,
  setAnnouncement,
  editor,
  isTooLong,
  isHeld,
  describedBy,
  access,
  linkFromLore,
  universeId,
  scene,
}: ReturnType<typeof useManuscriptState> & {
  universeId: string
  scene: Scene
  access: ReturnType<typeof useUniverseAccess>
  isTooLong: boolean
  isHeld: boolean
  describedBy: string
  linkFromLore: (next: string, count: number) => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.

  return (
    <>
      {access.editContent ? (
        <div
          className="segmented manuscript__mode"
          role="group"
          aria-label={t('manuscript.editor.mode')}
        >
          <button
            className="segmented__option"
            type="button"
            aria-pressed={!isReading}
            onClick={() => setIsReading(false)}
            data-testid="manuscript-mode-write"
          >
            {t('manuscript.editor.modeWrite')}
          </button>
          <button
            className="segmented__option"
            type="button"
            aria-pressed={isReading}
            onClick={() => setIsReading(true)}
            data-testid="manuscript-mode-read"
          >
            {t('manuscript.editor.modeRead')}
          </button>
        </div>
      ) : null}

      {isLinking && access.editContent && !isReading && !isHeld ? (
        <NameLinker
          universeId={universeId}
          entities={scene.entities}
          text={draft}
          onLink={linkFromLore}
          onClose={() => setIsLinking(false)}
        />
      ) : null}
      {access.editContent && !isReading ? (
        <ManuscriptWriter
          universeId={universeId}
          value={draft}
          onChange={setDraft}
          readOnly={isHeld}
          label={t('manuscript.editor.writeLabel', { title: scene.title })}
          placeholder={t('manuscript.editor.placeholder')}
          describedBy={describedBy}
          invalid={isTooLong}
          onAnnounce={setAnnouncement}
          onReady={(made) => {
            editor.current = made
          }}
        />
      ) : (
        // Read, and a collaborator who only reads (ADR 0041 amendment): the prose as prose, each mention a link to its
        // entry (issue 31).
        <div
          className="manuscript__text manuscript__read prose"
          role="region"
          aria-label={t('manuscript.editor.readLabel', { title: scene.title })}
          tabIndex={0}
          data-testid="manuscript-read"
        >
          {draft === '' ? (
            <p className="entry__blank">{t('manuscript.editor.nothingYet')}</p>
          ) : (
            <MentionProse universeId={universeId} text={draft} />
          )}
        </div>
      )}
    </>
  )
}
