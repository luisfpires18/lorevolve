import { useId } from 'react'
import { t } from '../../i18n'
import { useLeaveGuard } from '../../lib/leaveGuard'
import { nameOf } from '../../projectEntities/levelWords'
import { NODE_BODY_MAX_LENGTH, PANEL_SCRIPT, scriptOf } from '../../projectEntities/structure'
import { useUniverseAccess } from '../../universes/access'
import { scriptPartActions } from '../../projectEntities/scriptPartActions'
import { NO_SCRIPT, useScriptPartState } from '../../projectEntities/useScriptPartState'
import { useScriptPartLoad } from '../../projectEntities/useScriptPartLoad'
import { useSaveShortcut } from '../../lib/useSaveShortcut'
import { ScriptPartBar } from './ScriptPartBar'
import { ScriptPartFields } from './ScriptPartFields'
import { ScriptPartHead } from './ScriptPartHead'
import { ScriptPartNotices } from './ScriptPartNotices'
import { Button } from '../Button'

/** One part's text, and a panel's four script fields, with its own save. */
export function ScriptPart({
  projectId,
  universeId,
  nodeId,
  where,
  onSaved,
}: {
  projectId: string
  universeId: string
  nodeId: string
  where: string
  onSaved: () => void
}) {
  const canEdit = useUniverseAccess().editContent
  const titleId = useId()
  const statusId = useId()
  const state = useScriptPartState()
  const {
    node,
    draft,
    setDraft,
    script,
    setScript,
    isSaving,
    saves,
    failure,
    setFailure,
    changed,
    setAnnouncement,
  } = state

  const { load } = useScriptPartLoad({ ...state, projectId, nodeId })

  const isPanel = node?.level === 'panel'
  const stored = node ? scriptOf(node) : NO_SCRIPT
  const isDirty =
    node !== null &&
    (draft !== (node.body ?? '') ||
      (isPanel && PANEL_SCRIPT.some((part) => script[part] !== stored[part])))
  const isTooLong = draft.length > NODE_BODY_MAX_LENGTH
  const name = node ? nameOf(node) : ''

  useLeaveGuard(isDirty ? t('projects.script.unsaved', { name }) : null)

  const { save } = scriptPartActions({
    ...state,
    projectId,
    onSaved,
    canEdit,
    isPanel,
    isDirty,
    isTooLong,
  })

  // Ctrl+S or Cmd+S saves the open part, as the Manuscript does.
  useSaveShortcut(() => void save())

  if (!node) {
    return failure ? (
      <p className="form__message" role="alert" data-testid="project-script-part-failed">
        {failure}{' '}
        <Button
          tone="text"
          onClick={() => {
            setFailure(null)
            void load()
          }}
          data-testid="project-script-part-retry"
        >
          {t('projects.script.retry')}
        </Button>
      </p>
    ) : (
      <p className="projectcard__meta">{t('projects.common.loading')}</p>
    )
  }

  return (
    <section
      className="manuscript__editor"
      aria-labelledby={titleId}
      data-testid="project-script-part"
      data-node={node.id}
    >
      <ScriptPartHead where={where} titleId={titleId} name={name} />

      <ScriptPartFields
        universeId={universeId}
        canEdit={canEdit}
        draft={draft}
        setDraft={setDraft}
        name={name}
        isTooLong={isTooLong}
        setAnnouncement={setAnnouncement}
        isPanel={isPanel}
        script={script}
        setScript={setScript}
      />

      <ScriptPartNotices changed={changed} failure={failure} load={load} />

      {canEdit ? (
        <ScriptPartBar
          isTooLong={isTooLong}
          draft={draft}
          isDirty={isDirty}
          isSaving={isSaving}
          saves={saves}
          node={node}
          isPanel={isPanel}
          statusId={statusId}
          save={save}
        />
      ) : null}
    </section>
  )
}
