import { useId, useState } from 'react'
import { t } from '../../i18n'
import { useLeaveGuard } from '../../lib/leaveGuard'
import { nameOf } from '../../projectEntities/levelWords'
import { NODE_BODY_MAX_LENGTH, NODE_CHANGED } from '../../projectEntities/structure'
import { useUniverseAccess } from '../../universes/access'
import { draftOf, useNodeEdit } from '../../projectEntities/useNodeEdit'
import { isChangedElsewhere } from '../../lib/editConflict'
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
  // A Script part keeps the shared changed-elsewhere rule, the 409 included, and shows it as a conflict bar.
  const edit = useNodeEdit(projectId, nodeId, (error) => isChangedElsewhere(error, NODE_CHANGED))
  const { node, draft: fields, setDraft: setFields, isSaving, changed, message: failure } = edit
  const [saves, setSaves] = useState(0)
  const [, setAnnouncement] = useState('')
  const draft = fields.body
  const script = fields.script

  const isPanel = node?.level === 'panel'
  const isDirty = edit.isDirty
  const isTooLong = draft.length > NODE_BODY_MAX_LENGTH
  const name = node ? nameOf(node) : ''

  useLeaveGuard(isDirty ? t('projects.script.unsaved', { name }) : null)

  async function save() {
    if (!node || isSaving || !isDirty || isTooLong || !canEdit) return
    // Only a panel holds a script; the API refuses script text on any other level.
    await edit.save({ body: draft, script: isPanel ? script : null }, (saved) => {
      edit.setNode(saved)
      setFields(draftOf(saved))
      setSaves((value) => value + 1)
      onSaved()
    })
  }

  // Ctrl+S or Cmd+S saves the open part, as the Manuscript does.
  useSaveShortcut(() => void save())

  if (!node) {
    return failure ? (
      <FormMessage testId="project-script-part-failed">
        {failure}{' '}
        <Button tone="text" onClick={edit.retry} data-testid="project-script-part-retry">
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
        setDraft={(body) => setFields({ ...fields, body })}
        name={name}
        isTooLong={isTooLong}
        setAnnouncement={setAnnouncement}
        isPanel={isPanel}
        script={script}
        setScript={(next) => setFields({ ...fields, script: next })}
      />

      <EditorNotices
        testId="project-script"
        conflict={
          changed
            ? {
                text: t('projects.structure.changed'),
                onLoadSaved: edit.reload,
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
