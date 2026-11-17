import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import { ManuscriptParts, type ManuscriptPartGroup } from './ManuscriptParts'
import { ManuscriptWriter } from './ManuscriptWriter'
import { MentionProse } from './MentionProse'
import { SaveAction } from './SaveAction'
import { ScriptField } from './ComicPageEditor'
import { t, useI18n } from '../i18n'
import { numberFormat } from '../i18n/format'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { capital, levelWord, nameOf } from '../projectEntities/levelWords'
import {
  childrenOf,
  getNode,
  getStructure,
  NODE_BODY_MAX_LENGTH,
  NODE_CHANGED,
  PANEL_SCRIPT,
  saveNode,
  scriptOf,
  type PanelScript,
  type ProjectNodeDetail,
  type ProjectNodeSummary,
  type ProjectStructureTree,
} from '../projectEntities/structure'
import { projectPath } from '../projects/sections'
import { useUniverseAccess } from '../universes/access'

const count = (value: number) => numberFormat({}, 'en').format(value)

/**
 * A Series', Film's or Comic's Script view (#377): every node of its structure listed beside the text it holds, in the
 * Manuscript layout. The part open is named by `?node=`, the same link Structure uses, and is the first one by default.
 * Each part saves through the node's own route with the version it was read at, so a change made elsewhere is refused
 * rather than overwritten.
 */
export function ProjectScript({
  projectId,
  universeId,
}: {
  projectId: string
  universeId: string
}) {
  const { tx } = useI18n()
  const [tree, setTree] = useState<ProjectStructureTree | 'none' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [params] = useSearchParams()
  const structurePath = projectPath(projectId, 'structure', universeId)
  const scriptPath = projectPath(projectId, 'script', universeId)

  const read = useCallback(
    (signal?: AbortSignal) =>
      getStructure(projectId, signal)
        .then(setTree)
        .catch((error: unknown) => {
          if (signal?.aborted) return
          if (error instanceof ApiError && error.status === 404) setTree('none')
          else setFailed(error instanceof Error ? error.message : t('projects.structure.failed'))
        }),
    [projectId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void read(controller.signal)
    return () => controller.abort()
  }, [read])

  const structureLink = (
    <Link to={structurePath} data-testid="project-script-structure">
      {t('projects.script.structureLink')}
    </Link>
  )

  if (tree === null) {
    return failed ? (
      <p role="alert" data-testid="project-script-failed">
        {failed}
      </p>
    ) : (
      <p className="projectcard__meta">{t('projects.common.loading')}</p>
    )
  }

  if (tree === 'none') {
    return (
      <EmptyState
        title={t('projects.script.noFormat')}
        hint={tx('projects.script.noFormatHint', { link: structureLink })}
        testId="project-script-no-format"
      />
    )
  }

  const part = (node: ProjectNodeSummary, depth: number) => ({
    id: node.id,
    title: nameOf(node),
    to: `${scriptPath}?node=${node.id}`,
    depth,
    mark:
      node.bodyLength > 0 ? (
        <span className="visually-hidden">{`, ${t('projects.script.hasText')}`}</span>
      ) : null,
  })
  // Depth first: every level holds text, so every node is a part. A top node with parts under it heads its own group;
  // top nodes with none (a short film's scenes) share one unnamed group, so no part is listed twice.
  const groups: ManuscriptPartGroup[] = []
  for (const root of childrenOf(tree, null)) {
    const parts: ReturnType<typeof part>[] = []
    const walk = (node: ProjectNodeSummary, depth: number) => {
      parts.push(part(node, depth))
      childrenOf(tree, node.id).forEach((child) => walk(child, depth + 1))
    }
    walk(root, 0)
    const last = groups.at(-1)
    if (parts.length > 1) groups.push({ key: root.id, label: <bdi>{nameOf(root)}</bdi>, parts })
    else if (last && !last.label)
      groups[groups.length - 1] = { ...last, parts: [...last.parts, ...parts] }
    else groups.push({ key: root.id, parts })
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title={t('projects.script.empty')}
        hint={tx('projects.script.emptyHint', { link: structureLink })}
        testId="project-script-empty"
      />
    )
  }

  const asked = params.get('node')
  const current = tree.nodes.find((node) => node.id === asked) ?? childrenOf(tree, null)[0]
  const siblings = childrenOf(tree, current.parentId)

  return (
    <ManuscriptParts
      groups={groups}
      currentId={current.id}
      heading={t('projects.script.heading')}
      outlineLabel={t('projects.script.outline')}
      toggleLabel={t('projects.script.parts')}
      closeLabel={t('projects.script.closeParts')}
      chooseLabel={t('projects.script.choose')}
      noneLabel={t('projects.script.empty')}
    >
      <ScriptPart
        key={current.id}
        projectId={projectId}
        universeId={universeId}
        nodeId={current.id}
        where={t('projects.script.position', {
          level: capital(levelWord(current.level)),
          number: siblings.findIndex((node) => node.id === current.id) + 1,
          total: siblings.length,
        })}
        onSaved={() => void read()}
      />
    </ManuscriptParts>
  )
}

const NO_SCRIPT: PanelScript = { dialogue: '', caption: '', sfx: '', notes: '' }

/** One part's text, and a panel's four script fields, with its own save. */
function ScriptPart({
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
  const [node, setNode] = useState<ProjectNodeDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [script, setScript] = useState<PanelScript>(NO_SCRIPT)
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [, setAnnouncement] = useState('')

  const load = useCallback(
    (signal?: AbortSignal) =>
      getNode(projectId, nodeId, signal)
        .then((read) => {
          setNode(read)
          setDraft(read.body ?? '')
          setScript(scriptOf(read))
          setChanged(false)
          setFailure(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted)
            setFailure(error instanceof Error ? error.message : t('projects.structure.failed'))
        }),
    [projectId, nodeId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const isPanel = node?.level === 'panel'
  const stored = node ? scriptOf(node) : NO_SCRIPT
  const isDirty =
    node !== null &&
    (draft !== (node.body ?? '') ||
      (isPanel && PANEL_SCRIPT.some((part) => script[part] !== stored[part])))
  const isTooLong = draft.length > NODE_BODY_MAX_LENGTH
  const name = node ? nameOf(node) : ''

  useLeaveGuard(isDirty ? t('projects.script.unsaved', { name }) : null)

  async function save() {
    if (!node || isSaving || !isDirty || isTooLong || !canEdit) return
    setIsSaving(true)
    setFailure(null)
    setChanged(false)
    try {
      // The PUT replaces every field, so the title and summary go back as they were read. Only a panel holds a script;
      // the API refuses script text on any other level.
      const saved = await saveNode(projectId, node.id, {
        title: node.title,
        summary: node.summary,
        body: draft || null,
        expectedVersion: node.version,
        dialogue: isPanel ? script.dialogue || null : null,
        caption: isPanel ? script.caption || null : null,
        sfx: isPanel ? script.sfx || null : null,
        notes: isPanel ? script.notes || null : null,
      })
      setNode(saved)
      setDraft(saved.body ?? '')
      setScript(scriptOf(saved))
      setSaves((value) => value + 1)
      onSaved()
    } catch (error: unknown) {
      if (isChangedElsewhere(error, NODE_CHANGED)) setChanged(true)
      else setFailure(error instanceof Error ? error.message : t('projects.structure.failed'))
    } finally {
      setIsSaving(false)
    }
  }

  // Ctrl+S or Cmd+S saves the open part, as the Manuscript does.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (!node) {
    return failure ? (
      <p role="alert" data-testid="project-script-part-failed">
        {failure}
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
      <header className="manuscript__head">
        <p className="manuscript__where" data-testid="project-script-where">
          <span className="manuscript__position">{where}</span>
        </p>
        <div className="manuscript__titlerow">
          <h3 className="manuscript__title" id={titleId} data-testid="project-script-title">
            <bdi>{name}</bdi>
          </h3>
        </div>
      </header>

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
            <p className="entry__blank">{t('projects.script.nothingYet')}</p>
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

      {changed ? (
        <p className="form__message" role="alert" data-testid="project-script-changed">
          {t('projects.structure.changed')}{' '}
          <button
            className="button button--text"
            type="button"
            onClick={() => void load()}
            data-testid="project-script-reload"
          >
            {t('projects.script.reload')}
          </button>
        </p>
      ) : null}
      {failure ? (
        <p className="form__message" role="alert" data-testid="project-script-save-failed">
          {failure}
        </p>
      ) : null}

      {canEdit ? (
        <div className="manuscript__bar">
          {isTooLong ? (
            <p className="field__error manuscript__toolong" data-testid="project-script-too-long">
              {t('projects.script.tooLong', {
                used: count(draft.length),
                max: count(NODE_BODY_MAX_LENGTH),
              })}
            </p>
          ) : null}
          <SaveAction
            label={t('projects.script.save')}
            isDirty={isDirty}
            isSaving={isSaving}
            isBlocked={isTooLong}
            saves={saves}
            restingStatus={
              node.body || isPanel ? t('projects.script.saved') : t('projects.script.nothingSaved')
            }
            statusId={statusId}
            statusTestId="project-script-status"
            testId="project-script-save"
            type="button"
            onSave={() => void save()}
            keyShortcuts="Control+S Meta+S"
          />
        </div>
      ) : null}
    </section>
  )
}
