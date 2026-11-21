import { useCallback, useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { Field } from './Field'
import { ScriptField } from './projectEntities/ScriptPartFields'
import { FieldImageInput } from './FieldImageInput'
import { PictureWithFallback } from './PictureWithFallback'
import { ApiError } from '../lib/api'
import type { FieldImageRef } from '../lore/types'
import { nodeImageApi } from '../projectEntities/nodeImages'
import {
  getNode,
  NODE_CHANGED,
  saveNode,
  PANEL_SCRIPT,
  scriptOf,
  type PanelScript,
  type ProjectNodeDetail,
  type ProjectNodeSummary,
} from '../projectEntities/structure'
import { t } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { Button } from './Button'
import { errorText } from '../lib/errorText'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'
import { Section } from './Section'
/**
 * A page's or panel's picture (#295), on the image field control: free crop, replace, recrop, remove. With no picture,
 * or one that fails to load, a placeholder holds its place; the script never depends on it.
 */
export function ComicArt({
  projectId,
  nodeId,
  label,
  image,
  onChanged,
}: {
  projectId: string
  nodeId: string
  label: string
  image: FieldImageRef | null
  onChanged: (image: FieldImageRef | null) => void
}) {
  const canEdit = useUniverseAccess().editContent
  const placeholder = (
    <span
      className="imagefield__preview imagefield__preview--blank"
      data-testid={`comic-art-placeholder-${nodeId}`}
    >
      <ActionIcon icon={ImageOff} />
      {t('projects.structure.art.missing')}
    </span>
  )
  // A reader who cannot edit sees the picture alone: upload, recrop and remove would only answer 403.
  if (!canEdit)
    return (
      <figure className="imagefield__row" data-testid={`comic-art-readonly-${nodeId}`}>
        {image ? (
          <PictureWithFallback
            className="imagefield__preview imagefield__preview--field"
            src={nodeImageApi(projectId, nodeId).url(image, 'crop')}
            alt={label}
            width={image.width}
            height={image.height}
            fallback={placeholder}
          />
        ) : (
          placeholder
        )}
      </figure>
    )
  return (
    <FieldImageInput
      universeId=""
      entityId={nodeId}
      fieldId={nodeId}
      name={label}
      shape={null}
      image={image}
      pending={null}
      onPending={() => undefined}
      onChanged={onChanged}
      disabled={false}
      api={nodeImageApi(projectId, nodeId)}
      placeholder={placeholder}
    />
  )
}

/**
 * A page's panels as cards (#295): each with its visual description, its script and its artwork, saved on its own over
 * the version it was read at. Adding, ordering and deleting panels stays in the outline.
 */
export function ComicPageEditor({
  projectId,
  panels,
  onDirtyChange,
  onSavingChange,
}: {
  projectId: string
  panels: ProjectNodeSummary[]
  /** Any card unsaved, or saving: the drawer guards and locks for them. */
  onDirtyChange: (dirty: boolean) => void
  onSavingChange: (saving: boolean) => void
}) {
  const [states, setStates] = useState<Record<string, { dirty: boolean; saving: boolean }>>({})
  const report = useCallback((id: string, dirty: boolean, saving: boolean) => {
    setStates((current) => ({ ...current, [id]: { dirty, saving } }))
  }, [])
  const live = panels.map((panel) => states[panel.id])
  const [anyDirty, anySaving] = [live.some((one) => one?.dirty), live.some((one) => one?.saving)]
  useEffect(() => {
    onDirtyChange(anyDirty)
    onSavingChange(anySaving)
  }, [anyDirty, anySaving, onDirtyChange, onSavingChange])

  return (
    <Section
      level={3}
      title={t('projects.structure.panel.panels')}
      titleProps={{ tone: 'rule' }}
      testId="comic-page-editor"
    >
      {panels.length === 0 ? (
        <QuietNote spacing="flush">{t('projects.structure.panel.none')}</QuietNote>
      ) : (
        panels.map((panel, index) => (
          <PanelCard
            key={panel.id}
            projectId={projectId}
            panelId={panel.id}
            number={index + 1}
            report={report}
          />
        ))
      )}
    </Section>
  )
}

function PanelCard({
  projectId,
  panelId,
  number,
  report,
}: {
  projectId: string
  panelId: string
  number: number
  report: (id: string, dirty: boolean, saving: boolean) => void
}) {
  const [node, setNode] = useState<ProjectNodeDetail | null>(null)
  const [body, setBody] = useState('')
  const [script, setScript] = useState<PanelScript>({
    dialogue: '',
    caption: '',
    sfx: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const canEdit = useUniverseAccess().editContent

  useEffect(() => {
    const controller = new AbortController()
    getNode(projectId, panelId, controller.signal)
      .then((read) => {
        setNode(read)
        setBody(read.body ?? '')
        setScript(scriptOf(read))
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus(errorText(error, t('projects.structure.failed')))
      })
    return () => controller.abort()
  }, [projectId, panelId])

  const testId = (part: string) => `comic-panel-${panelId}-${part}`
  const isDirty =
    node !== null &&
    !saving &&
    (body !== (node.body ?? '') || JSON.stringify(script) !== JSON.stringify(scriptOf(node)))
  useEffect(() => {
    report(panelId, isDirty, saving)
  }, [report, panelId, isDirty, saving])

  function save() {
    if (!node || saving || !canEdit) return
    setSaving(true)
    setStatus(null)
    saveNode(projectId, node.id, {
      title: node.title,
      summary: node.summary,
      body: body || null,
      expectedVersion: node.version,
      dialogue: script.dialogue || null,
      caption: script.caption || null,
      sfx: script.sfx || null,
      notes: script.notes || null,
    })
      .then((saved) => {
        setNode(saved)
        setStatus(t('projects.structure.panel.saved'))
      })
      .catch((error: unknown) =>
        setStatus(
          error instanceof ApiError && error.code === NODE_CHANGED
            ? t('projects.structure.changed')
            : errorText(error, t('projects.structure.failed')),
        ),
      )
      .finally(() => setSaving(false))
  }

  return (
    <Section
      level={4}
      title={node?.title ?? `${t('projects.structure.levels.panel')} ${number}`}
      testId={`comic-panel-${panelId}`}
    >
      {node ? (
        <>
          <ComicArt
            projectId={projectId}
            nodeId={node.id}
            label={t('projects.structure.art.panelArt')}
            image={node.image}
            onChanged={(image) => setNode({ ...node, image })}
          />
          <Field
            as="textarea"
            label={t('projects.structure.panel.visualDescription')}
            rows={3}
            readOnly={!canEdit}
            value={body}
            placeholder={t('projects.structure.panel.visualPlaceholder')}
            onChange={(event) => setBody(event.target.value)}
            data-testid={testId('visual')}
          />
          {PANEL_SCRIPT.map((part) => (
            <ScriptField
              key={part}
              part={part}
              value={script[part]}
              onChange={(value) => setScript({ ...script, [part]: value })}
              testId={testId(part)}
              readOnly={!canEdit}
            />
          ))}
          <div className="actions">
            {canEdit ? (
              <Button disabled={saving} onClick={save} data-testid={testId('save')}>
                {saving ? t('projects.structure.saving') : t('shell.actions.save')}
              </Button>
            ) : null}
            {status ? (
              <span role="status" data-testid={testId('status')}>
                {status}
              </span>
            ) : null}
          </div>
        </>
      ) : status ? (
        <FormMessage>{status}</FormMessage>
      ) : null}
    </Section>
  )
}
