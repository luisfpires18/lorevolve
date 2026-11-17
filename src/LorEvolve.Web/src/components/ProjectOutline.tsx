import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ActionMenu } from './ActionMenu'
import { Drawer } from './Drawer'
import { EmptyState } from './EmptyState'
import { Field } from './Field'
import { ComicArt, ComicPageEditor, ScriptField } from './ComicPageEditor'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { listSeasons } from '../projectEntities/seasons'
import {
  addableLevels,
  ART_LEVELS,
  childrenOf,
  createNode,
  deleteNode,
  descendantCount,
  getNode,
  getStructure,
  moveNode,
  moveTargets,
  NODE_CHANGED,
  PANEL_SCRIPT,
  saveNode,
  scriptOf,
  type PanelScript,
  type ProjectNodeDetail,
  type ProjectNodeSummary,
  type ProjectStructureTree,
} from '../projectEntities/structure'
import { capital, levelWord, nameOf } from '../projectEntities/levelWords'
import { t, tn, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'

/**
 * A project's outline, shaped by the rules its format has (#290): nested ordered lists, an Add button per level the
 * rules allow, order moved one place at a time like the seasons list, and one node edited at a time in a drawer.
 *
 * A project whose format has no rules gets a 404 from the tree read, and `legacy` is drawn instead, unchanged. A
 * formatted project that still has legacy rows shows them below, under "Earlier structure".
 */
export function ProjectOutline({ projectId, legacy }: { projectId: string; legacy: ReactNode }) {
  useI18n()
  const [tree, setTree] = useState<ProjectStructureTree | 'none' | null>(null)
  const [hasLegacy, setHasLegacy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  // A link from a story arc or event (#296) names the node to open: read once on load, ignored when unknown.
  const [params] = useSearchParams()
  const [linked] = useState(() => params.get('node'))

  useEffect(() => {
    const controller = new AbortController()
    getStructure(projectId, controller.signal)
      .then((read) => {
        setTree(read)
        if (linked && read.nodes.some((node) => node.id === linked)) setEditing(linked)
        return listSeasons(projectId, controller.signal).then((seasons) =>
          setHasLegacy(seasons.length > 0),
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) {
          setTree('none')
          return
        }
        setFailed(error instanceof Error ? error.message : t('projects.structure.failed'))
      })
    return () => controller.abort()
  }, [projectId, linked])

  function refresh() {
    return getStructure(projectId).then((read) => {
      setTree(read)
      setBusy(false)
      setFailed(null)
    })
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.structure.failed'))
  }

  function run(work: Promise<unknown>) {
    setBusy(true)
    work.then(refresh).catch(failing)
  }

  function add(level: string, parentId: string | null) {
    setBusy(true)
    createNode(projectId, { level, parentId })
      .then((created) => refresh().then(() => setEditing(created.id)))
      .catch(failing)
  }

  async function remove(current: ProjectStructureTree, node: ProjectNodeSummary) {
    const inside = descendantCount(current, node.id)
    if (
      !(await confirmAction({
        title: t('projects.structure.deleteTitle', { name: nameOf(node) }),
        message:
          inside === 0
            ? t('projects.structure.deleteEmpty')
            : tn('projects.structure.deleteMessage', inside),
        confirmLabel: t('projects.structure.delete'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    run(deleteNode(projectId, node.id))
  }

  if (tree === 'none') return <>{legacy}</>

  if (tree === null) {
    return failed ? (
      <p role="alert" data-testid="project-outline-failed">
        {failed}
      </p>
    ) : (
      <p className="projectcard__meta">{t('projects.common.loading')}</p>
    )
  }

  function addButtons(parent: ProjectNodeSummary | null) {
    const levels = addableLevels(tree as ProjectStructureTree, parent?.level ?? null)
    if (levels.length === 0) return null
    return (
      <div className="form__actions">
        {levels.map((level) => (
          <button
            key={level}
            className={parent ? 'button button--secondary button--sm' : 'button'}
            type="button"
            disabled={busy}
            data-testid={
              parent ? `project-node-add-${level}-${parent.id}` : `project-node-add-${level}`
            }
            onClick={() => add(level, parent?.id ?? null)}
          >
            {t('projects.structure.add', { level: levelWord(level) })}
          </button>
        ))}
      </div>
    )
  }

  function branch(parentId: string | null): ReactNode {
    const current = tree as ProjectStructureTree
    const nodes = childrenOf(current, parentId)
    if (nodes.length === 0) return null
    return (
      <ol
        className={parentId ? 'fieldlist' : 'projectcardlist'}
        data-testid={`project-outline-list-${parentId ?? 'root'}`}
      >
        {nodes.map((node, index) => (
          <li
            key={node.id}
            className={parentId ? 'fieldlist__row' : 'projectcard'}
            data-testid={`project-node-${node.id}`}
          >
            <div className="projectcard__head">
              <h3 className="projectcard__title">{nameOf(node)}</h3>
              <p className="projectcard__meta">{capital(levelWord(node.level))}</p>
              <div className="projectcard__actions">
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  data-testid={`project-node-open-${node.id}`}
                  onClick={() => setEditing(node.id)}
                >
                  {t('projects.structure.edit')}
                </button>
                <ActionMenu
                  label={t('projects.common.more', { name: nameOf(node) })}
                  triggerTestId={`project-node-actions-${node.id}`}
                >
                  {index === 0 ? null : (
                    <button
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-up-${node.id}`}
                      onClick={() =>
                        run(moveNode(projectId, node.id, { place: index - 1, parentId }))
                      }
                    >
                      {t('projects.common.moveUp')}
                    </button>
                  )}
                  {index === nodes.length - 1 ? null : (
                    <button
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-down-${node.id}`}
                      onClick={() =>
                        run(moveNode(projectId, node.id, { place: index + 1, parentId }))
                      }
                    >
                      {t('projects.common.moveDown')}
                    </button>
                  )}
                  {moveTargets(current, node).map((target) => (
                    <button
                      key={target?.id ?? 'root'}
                      className="actionmenu__item"
                      type="button"
                      disabled={busy}
                      data-testid={`project-node-move-${node.id}-${target?.id ?? 'root'}`}
                      onClick={() =>
                        // Moved to the end of its new list; the server clamps the place.
                        run(
                          moveNode(projectId, node.id, {
                            place: Number.MAX_SAFE_INTEGER,
                            parentId: target?.id ?? null,
                          }),
                        )
                      }
                    >
                      {target
                        ? t('projects.structure.moveTo', { name: nameOf(target) })
                        : t('projects.structure.moveToTop')}
                    </button>
                  ))}
                  <button
                    className="actionmenu__item actionmenu__item--danger"
                    type="button"
                    disabled={busy}
                    data-testid={`project-node-delete-${node.id}`}
                    onClick={() => void remove(current, node)}
                  >
                    {t('projects.structure.delete')}
                  </button>
                </ActionMenu>
              </div>
            </div>
            {node.summary ? <p className="prose">{node.summary}</p> : null}
            {addButtons(node)}
            {branch(node.id)}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <>
      <section className="projects" data-testid="project-outline">
        <header className="projects__head">
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.structure.title')}</h2>
            <p className="projects__lede">{t('projects.structure.lede')}</p>
          </div>
          {addButtons(null)}
        </header>

        {failed ? (
          <p role="alert" data-testid="project-outline-failed">
            {failed}
          </p>
        ) : null}

        {tree.nodes.length === 0 ? (
          <EmptyState
            title={t('projects.structure.empty')}
            hint={t('projects.structure.emptyHint')}
            testId="project-outline-empty"
          />
        ) : null}

        {branch(null)}
      </section>

      {editing ? (
        <NodeEditor
          key={editing}
          projectId={projectId}
          nodeId={editing}
          panels={childrenOf(tree, editing).filter((child) => child.level === 'panel')}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh().catch(failing)
          }}
        />
      ) : null}

      {hasLegacy ? (
        <section className="projects" data-testid="project-outline-earlier">
          <header className="projects__head">
            <div className="projects__headtext">
              <h2 className="sectionrule">{t('projects.structure.earlier')}</h2>
              <p className="projects__lede">{t('projects.structure.earlierHint')}</p>
            </div>
          </header>
          {legacy}
        </section>
      ) : null}
    </>
  )
}

/**
 * One node's title, summary and text, saved over the version it was opened at (ADR 0043). A panel adds its script, a
 * page or panel its artwork, and a page lists its panels to edit in place (#295).
 */
function NodeEditor({
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
        if (!controller.signal.aborted)
          setFailed(error instanceof Error ? error.message : t('projects.structure.failed'))
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
            : error instanceof Error
              ? error.message
              : t('projects.structure.failed'),
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
        <>
          {canEdit ? (
            <button
              className="button"
              type="submit"
              disabled={saving || !node}
              data-testid="project-node-save"
            >
              {saving ? t('projects.structure.saving') : t('projects.structure.save')}
            </button>
          ) : null}
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
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
