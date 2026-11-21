import { ManuscriptWriter } from '../ManuscriptWriter'
import { MentionProse } from '../MentionProse'
import { Field } from '../Field'
import { t } from '../../i18n'
import { PANEL_SCRIPT, type PanelScript } from '../../projectEntities/structure'
import { QuietNote } from '../QuietNote'

const SCRIPT_ROWS: Record<(typeof PANEL_SCRIPT)[number], number> = {
  dialogue: 4,
  caption: 2,
  sfx: 2,
  notes: 3,
}

/** One textarea of a panel's script, labelled and with its placeholder. */
export function ScriptField({
  part,
  value,
  onChange,
  testId,
  readOnly = false,
}: {
  part: (typeof PANEL_SCRIPT)[number]
  value: string
  onChange: (value: string) => void
  testId: string
  readOnly?: boolean
}) {
  return (
    <Field
      as="textarea"
      label={t(`projects.structure.panel.${part}`)}
      rows={SCRIPT_ROWS[part]}
      maxLength={4000}
      readOnly={readOnly}
      value={value}
      placeholder={t(`projects.structure.panel.${part}Placeholder`)}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
    />
  )
}

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
  setDraft: (draft: string) => void
  name: string
  isTooLong: boolean
  setAnnouncement: (text: string) => void
  isPanel: boolean
  script: PanelScript
  setScript: (script: PanelScript) => void
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
