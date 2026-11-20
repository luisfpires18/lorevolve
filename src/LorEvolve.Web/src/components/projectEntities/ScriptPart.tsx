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
import { EditorSaveBar } from '../EditorSaveBar'
import { ManuscriptHead } from '../stories/ManuscriptHead'
import { ScriptPartFields } from './ScriptPartFields'
import { EditorNotices } from '../EditorNotices'
import { Button } from '../Button'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

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
      <FormMessage testId="project-script-part-failed">
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
      </FormMessage>
    ) : (
      <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
    )
  }

  return (
    <section
      className="manuscript__editor"
      aria-labelledby={titleId}
      data-testid="project-script-part"
      data-node={node.id}
    >
      <ManuscriptHead
        where={{ position: where }}
        titleId={titleId}
        title={name}
        whereTestId="project-script-where"
        titleTestId="project-script-title"
      />

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

      <EditorNotices
        testId="project-script"
        conflict={
          changed
            ? {
                text: t('projects.structure.changed'),
                onLoadSaved: () => void load(),
                loadLabel: t('projects.script.reload'),
              }
            : null
        }
        failure={failure}
        failureTestId="project-script-save-failed"
      />

      {canEdit ? (
        <EditorSaveBar
          keyShortcuts
          count={{
            id: 'project-script-too-long',
            used: draft.length,
            max: NODE_BODY_MAX_LENGTH,
            show: 'over',
            words: { tooLong: 'projects.script.tooLong' },
            className: 'manuscript__toolong',
            testId: 'project-script-too-long',
          }}
          save={{
            label: t('projects.script.save'),
            isDirty,
            isSaving,
            isBlocked: isTooLong,
            saves,
            restingStatus:
              node.body || isPanel ? t('projects.script.saved') : t('projects.script.nothingSaved'),
            statusId,
            statusTestId: 'project-script-status',
            testId: 'project-script-save',
            type: 'button',
            onSave: () => void save(),
          }}
        />
      ) : null}
    </section>
  )
}
