import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { Field } from './Field'
import { FieldImageInput } from './FieldImageInput'
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
    <Field label={t(`projects.structure.panel.${part}`)}>
      {(control) => (
        <textarea
          {...control}
          className="field__input"
          rows={SCRIPT_ROWS[part]}
          maxLength={4000}
          readOnly={readOnly}
          value={value}
          placeholder={t(`projects.structure.panel.${part}Placeholder`)}
          onChange={(event) => onChange(event.target.value)}
          data-testid={testId}
        />
      )}
    </Field>
  )
}

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
  const [broken, setBroken] = useState(false)
  const placeholder = (
    <span
      className="imagefield__preview imagefield__preview--blank comicart__placeholder"
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
        {image && !broken ? (
          <img
            className="imagefield__preview imagefield__preview--field"
            src={nodeImageApi(projectId, nodeId).url(image, 'crop')}
            alt={label}
            width={image.width}
            height={image.height}
            onError={() => setBroken(true)}
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
}: {
  projectId: string
  panels: ProjectNodeSummary[]
}) {
  return (
    <section className="comicpage" data-testid="comic-page-editor">
      <h3 className="sectionrule">{t('projects.structure.panel.panels')}</h3>
      {panels.length === 0 ? (
        <p className="projects__lede">{t('projects.structure.panel.none')}</p>
      ) : (
        panels.map((panel, index) => (
          <PanelCard key={panel.id} projectId={projectId} panelId={panel.id} number={index + 1} />
        ))
      )}
    </section>
  )
}

function PanelCard({
  projectId,
  panelId,
  number,
}: {
  projectId: string
  panelId: string
  number: number
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
        if (!controller.signal.aborted)
          setStatus(error instanceof Error ? error.message : t('projects.structure.failed'))
      })
    return () => controller.abort()
  }, [projectId, panelId])

  const testId = (part: string) => `comic-panel-${panelId}-${part}`

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
            : error instanceof Error
              ? error.message
              : t('projects.structure.failed'),
        ),
      )
      .finally(() => setSaving(false))
  }

  return (
    <article className="comicpage__panel" data-testid={`comic-panel-${panelId}`}>
      <h4 className="comicpage__title">
        {node?.title ?? `${t('projects.structure.levels.panel')} ${number}`}
      </h4>
      {node ? (
        <>
          <ComicArt
            projectId={projectId}
            nodeId={node.id}
            label={t('projects.structure.art.panelArt')}
            image={node.image}
            onChanged={(image) => setNode({ ...node, image })}
          />
          <Field label={t('projects.structure.panel.visualDescription')}>
            {(control) => (
              <textarea
                {...control}
                className="field__input"
                rows={3}
                readOnly={!canEdit}
                value={body}
                placeholder={t('projects.structure.panel.visualPlaceholder')}
                onChange={(event) => setBody(event.target.value)}
                data-testid={testId('visual')}
              />
            )}
          </Field>
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
          <div className="comicpage__actions">
            {canEdit ? (
              <button
                className="button"
                type="button"
                disabled={saving}
                onClick={save}
                data-testid={testId('save')}
              >
                {saving ? t('projects.structure.saving') : t('projects.structure.panel.save')}
              </button>
            ) : null}
            {status ? (
              <span role="status" data-testid={testId('status')}>
                {status}
              </span>
            ) : null}
          </div>
        </>
      ) : status ? (
        <p role="alert">{status}</p>
      ) : null}
    </article>
  )
}
