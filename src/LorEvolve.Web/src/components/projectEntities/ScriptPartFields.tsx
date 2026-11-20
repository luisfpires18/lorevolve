import { ManuscriptWriter } from '../ManuscriptWriter'
import { MentionProse } from '../MentionProse'
import { ScriptField } from '../ComicPageEditor'
import { t } from '../../i18n'
import { PANEL_SCRIPT, type PanelScript } from '../../projectEntities/structure'
import type { useScriptPartState } from '../../projectEntities/useScriptPartState'
import { QuietNote } from '../QuietNote'

export function ScriptPartFields({
  universeId,
  canEdit,
  draft,
  setDraft,
  name,
  isTooLong,
  setAnnouncement,
  isPanel,
  script,
  setScript,
}: {
  universeId: string
  canEdit: boolean
  draft: string
  setDraft: ReturnType<typeof useScriptPartState>['setDraft']
  name: string
  isTooLong: boolean
  setAnnouncement: ReturnType<typeof useScriptPartState>['setAnnouncement']
  isPanel: boolean
  script: PanelScript
  setScript: ReturnType<typeof useScriptPartState>['setScript']
}) {
  return (
    <>
      {canEdit ? (
        <ManuscriptWriter
          universeId={universeId}
          value={draft}
          onChange={setDraft}
          readOnly={false}
          label={t('projects.script.writeLabel', { name })}
          placeholder={t('projects.script.placeholder')}
          invalid={isTooLong}
          onAnnounce={setAnnouncement}
          onReady={() => undefined}
        />
      ) : (
        <div
          className="manuscript__text manuscript__read prose"
          role="region"
          aria-label={t('projects.script.readLabel', { name })}
          tabIndex={0}
          data-testid="project-script-read"
        >
          {draft === '' ? (
            <QuietNote size="body">{t('projects.script.nothingYet')}</QuietNote>
          ) : (
            <MentionProse universeId={universeId} text={draft} />
          )}
        </div>
      )}

      {isPanel
        ? PANEL_SCRIPT.map((part) => (
            <ScriptField
              key={part}
              part={part}
              value={script[part]}
              onChange={(value) => setScript({ ...script, [part]: value })}
              testId={`project-script-panel-${part}`}
              readOnly={!canEdit}
            />
          ))
        : null}
    </>
  )
}
