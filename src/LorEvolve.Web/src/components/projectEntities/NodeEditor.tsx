import { useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { ComicArt, ComicPageEditor } from '../ComicPageEditor'
import { ScriptField } from './ScriptPartFields'
import { ART_LEVELS, PANEL_SCRIPT, type ProjectNodeSummary } from '../../projectEntities/structure'
import { nodeChangedCode, useNodeEdit } from '../../projectEntities/useNodeEdit'
import { capital, levelWord, nameOf } from '../../projectEntities/levelWords'
import { t } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { FormActions } from '../FormActions'
import { FormMessage } from '../FormMessage'

/**
 * One node's title, summary and text, saved over the version it was opened at (ADR 0043). A panel adds its script, a
 * page or panel its artwork, and a page lists its panels to edit in place (#295).
 */
export function NodeEditor({
  projectId,
  nodeId,
  panels,
  onClose,
  onSaved,
}: {
  projectId: string
  nodeId: string
  panels: ProjectNodeSummary[]
  onClose: () => void
  onSaved: () => void
}) {
  const edit = useNodeEdit(projectId, nodeId, nodeChangedCode)
  const { node, draft, setDraft } = edit
  const canEdit = useUniverseAccess().editContent
  // A page's panel cards save on their own; the drawer still guards and locks for them.
  const [panelsDirty, setPanelsDirty] = useState(false)
  const [panelsSaving, setPanelsSaving] = useState(false)
  const saving = edit.isSaving
  const failed = edit.changed ? t('projects.structure.changed') : edit.message

  function save() {
    if (!node || saving || !canEdit) return
    void edit.save(
      {
        title: draft.title || null,
        summary: draft.summary || null,
        body: draft.body,
        script: draft.script,
      },
      onSaved,
    )
  }

  return (
    <Drawer
      testId="project-node-editor"
      titleId="project-node-editor-title"
      eyebrow={node ? capital(levelWord(node.level)) : null}
      title={node ? nameOf(node) : t('projects.common.loading')}
      isDirty={edit.isDirty || panelsDirty}
      leaveMessage={t('projects.structure.leave')}
      onClose={onClose}
      onSubmit={save}
      busy={saving || panelsSaving}
      actions={(close) => (
        <FormActions
          submitLabel={canEdit ? t('projects.structure.save') : undefined}
          busy={saving}
          busyLabel={t('projects.structure.saving')}
          disabled={!node}
          submitTestId="project-node-save"
          onCancel={close}
        />
      )}
    >
      {failed ? <FormMessage testId="project-node-editor-failed">{failed}</FormMessage> : null}
      {node ? (
        <>
          <Field
            label={t('projects.structure.titleLabel')}
            name={null}
            value={draft.title}
            maxLength={200}
            readOnly={!canEdit}
            placeholder={t('projects.structure.titlePlaceholder')}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            data-testid="project-node-title"
          />
          <Field
            label={t('projects.structure.summaryLabel')}
            name={null}
            value={draft.summary}
            maxLength={2000}
            readOnly={!canEdit}
            placeholder={t('projects.structure.summaryPlaceholder')}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
            data-testid="project-node-summary"
          />
          <Field
            label={
              node.level === 'panel'
                ? t('projects.structure.panel.visualDescription')
                : t('projects.structure.bodyLabel')
            }
            as="textarea"
            rows={12}
            readOnly={!canEdit}
            value={draft.body}
            placeholder={t('projects.structure.bodyPlaceholder')}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            data-testid="project-node-body"
          />
          {node.level === 'panel'
            ? PANEL_SCRIPT.map((part) => (
                <ScriptField
                  key={part}
                  part={part}
                  value={draft.script[part]}
                  onChange={(value) =>
                    setDraft({ ...draft, script: { ...draft.script, [part]: value } })
                  }
                  testId={`project-node-${part}`}
                  readOnly={!canEdit}
                />
              ))
            : null}
          {ART_LEVELS.includes(node.level) ? (
            <ComicArt
              projectId={projectId}
              nodeId={node.id}
              label={
                node.level === 'page'
                  ? t('projects.structure.art.pageArt')
                  : t('projects.structure.art.panelArt')
              }
              image={node.image}
              onChanged={(image) => edit.setNode({ ...node, image })}
            />
          ) : null}
          {node.level === 'page' ? (
            <ComicPageEditor
              projectId={projectId}
              panels={panels}
              onDirtyChange={setPanelsDirty}
              onSavingChange={setPanelsSaving}
            />
          ) : null}
        </>
      ) : null}
    </Drawer>
  )
}
