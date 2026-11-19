import { useEffect, useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { ComicArt, ComicPageEditor, ScriptField } from '../ComicPageEditor'
import { ApiError } from '../../lib/api'
import {
  ART_LEVELS,
  getNode,
  NODE_CHANGED,
  PANEL_SCRIPT,
  saveNode,
  scriptOf,
  type PanelScript,
  type ProjectNodeDetail,
  type ProjectNodeSummary,
} from '../../projectEntities/structure'
import { capital, levelWord, nameOf } from '../../projectEntities/levelWords'
import { t } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { FormActions } from '../FormActions'
import { errorText } from '../../lib/errorText'

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
  const [node, setNode] = useState<ProjectNodeDetail | null>(null)
  const canEdit = useUniverseAccess().editContent
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [script, setScript] = useState<PanelScript>({
    dialogue: '',
    caption: '',
    sfx: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getNode(projectId, nodeId, controller.signal)
      .then((read) => {
        setNode(read)
        setTitle(read.title ?? '')
        setSummary(read.summary ?? '')
        setBody(read.body ?? '')
        setScript(scriptOf(read))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(errorText(error, t('projects.structure.failed')))
      })
    return () => controller.abort()
  }, [projectId, nodeId])

  const isDirty =
    node !== null &&
    (title !== (node.title ?? '') ||
      summary !== (node.summary ?? '') ||
      body !== (node.body ?? '') ||
      PANEL_SCRIPT.some((part) => script[part] !== (node[part] ?? '')))

  function save() {
    if (!node || saving || !canEdit) return
    setSaving(true)
    saveNode(projectId, node.id, {
      title: title || null,
      summary: summary || null,
      body: body || null,
      expectedVersion: node.version,
      dialogue: script.dialogue || null,
      caption: script.caption || null,
      sfx: script.sfx || null,
      notes: script.notes || null,
    })
      .then(onSaved)
      .catch((error: unknown) => {
        setSaving(false)
        setFailed(
          error instanceof ApiError && error.code === NODE_CHANGED
            ? t('projects.structure.changed')
            : errorText(error, t('projects.structure.failed')),
        )
      })
  }

  return (
    <Drawer
      testId="project-node-editor"
      titleId="project-node-editor-title"
      eyebrow={node ? capital(levelWord(node.level)) : null}
      title={node ? nameOf(node) : t('projects.common.loading')}
      isDirty={isDirty}
      leaveMessage={t('projects.structure.leave')}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
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
      {failed ? (
        <p role="alert" data-testid="project-node-editor-failed">
          {failed}
        </p>
      ) : null}
      {node ? (
        <>
          <Field label={t('projects.structure.titleLabel')}>
            {(control) => (
              <input
                {...control}
                className="field__input"
                value={title}
                maxLength={200}
                readOnly={!canEdit}
                placeholder={t('projects.structure.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
                data-testid="project-node-title"
              />
            )}
          </Field>
          <Field label={t('projects.structure.summaryLabel')}>
            {(control) => (
              <input
                {...control}
                className="field__input"
                value={summary}
                maxLength={2000}
                readOnly={!canEdit}
                placeholder={t('projects.structure.summaryPlaceholder')}
                onChange={(event) => setSummary(event.target.value)}
                data-testid="project-node-summary"
              />
            )}
          </Field>
          <Field
            label={
              node.level === 'panel'
                ? t('projects.structure.panel.visualDescription')
                : t('projects.structure.bodyLabel')
            }
          >
            {(control) => (
              <textarea
                {...control}
                className="field__input"
                rows={12}
                readOnly={!canEdit}
                value={body}
                placeholder={t('projects.structure.bodyPlaceholder')}
                onChange={(event) => setBody(event.target.value)}
                data-testid="project-node-body"
              />
            )}
          </Field>
          {node.level === 'panel'
            ? PANEL_SCRIPT.map((part) => (
                <ScriptField
                  key={part}
                  part={part}
                  value={script[part]}
                  onChange={(value) => setScript({ ...script, [part]: value })}
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
              onChanged={(image) => setNode({ ...node, image })}
            />
          ) : null}
          {node.level === 'page' ? <ComicPageEditor projectId={projectId} panels={panels} /> : null}
        </>
      ) : null}
    </Drawer>
  )
}
