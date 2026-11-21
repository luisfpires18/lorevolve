import { useCallback, useState } from 'react'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errorText'
import { useAsyncRead } from '../lib/useAsyncRead'
import { useFormSave } from '../lib/useFormSave'
import {
  getNode,
  NODE_CHANGED,
  PANEL_SCRIPT,
  saveNode,
  scriptOf,
  type PanelScript,
  type ProjectNodeDetail,
  type ProjectNodeUpdate,
} from './structure'

/** A node's editable text as the form holds it: empty strings, never null. */
export interface NodeDraft {
  title: string
  summary: string
  body: string
  script: PanelScript
}

const NO_DRAFT: NodeDraft = {
  title: '',
  summary: '',
  body: '',
  script: { dialogue: '', caption: '', sfx: '', notes: '' },
}

export const draftOf = (node: ProjectNodeDetail): NodeDraft => ({
  title: node.title ?? '',
  summary: node.summary ?? '',
  body: node.body ?? '',
  script: scriptOf(node),
})

/**
 * The code alone, without the 409 `isChangedElsewhere` also checks: the node drawer's and a page's panel cards' own
 * rule, kept as it is (G14).
 */
export const nodeChangedCode = (error: unknown) =>
  error instanceof ApiError && error.code === NODE_CHANGED

/** What a save changes. The title and summary go back as they were read unless given; a null script sends none. */
export interface NodeSaveFields {
  title?: string | null
  summary?: string | null
  body: string
  script: PanelScript | null
}

/** The eight fields `saveNode` takes, over the version the node was read at (ADR 0043): the PUT replaces them all. */
export function nodeSaveBody(
  node: ProjectNodeDetail,
  { title = node.title, summary = node.summary, body, script }: NodeSaveFields,
): ProjectNodeUpdate {
  return {
    title,
    summary,
    body: body || null,
    expectedVersion: node.version,
    dialogue: script?.dialogue || null,
    caption: script?.caption || null,
    sfx: script?.sfx || null,
    notes: script?.notes || null,
  }
}

/**
 * One project node read and saved with the changed-elsewhere rule: the node drawer, a page's panel cards and a Script
 * part. The read fills the draft; `reload` reads again quietly (the node stays shown, and a failure says so in
 * `message`), `retry` shows loading again. A save refused by `isChanged` sets `changed`; any other refusal is the
 * message. `message` is also the caller's own line (a panel's "saved"). Catalogue: `docs/design/ui-components.md`.
 */
export function useNodeEdit(
  projectId: string,
  nodeId: string,
  isChanged: (error: unknown) => boolean,
) {
  const [draft, setDraft] = useState<NodeDraft>(NO_DRAFT)
  const [changed, setChanged] = useState(false)
  const form = useFormSave({
    needChange: null,
    failed: t('projects.structure.failed'),
    refusal: (error) => {
      if (!isChanged(error)) return errorText(error, t('projects.structure.failed'))
      setChanged(true)
      return true
    },
  })
  const { setMessage } = form

  const read = useCallback(
    (signal: AbortSignal) =>
      getNode(projectId, nodeId, signal).then(
        (node) => {
          if (!signal.aborted) {
            setDraft(draftOf(node))
            setChanged(false)
            setMessage(null)
          }
          return node
        },
        (error: unknown) => {
          if (!signal.aborted) setMessage(errorText(error, t('projects.structure.failed')))
          throw error
        },
      ),
    [projectId, nodeId, setMessage],
  )
  const { load, setLoad, retry, refresh } = useAsyncRead(read)
  const node = load.kind === 'ready' ? load.value : null

  const isDirty =
    node !== null &&
    (draft.title !== (node.title ?? '') ||
      draft.summary !== (node.summary ?? '') ||
      draft.body !== (node.body ?? '') ||
      PANEL_SCRIPT.some((part) => draft.script[part] !== (node[part] ?? '')))

  /** Saves `fields` over the node as read; `done` gets the saved node. Resolves `true` when it saved. */
  async function save(fields: NodeSaveFields, done: (saved: ProjectNodeDetail) => void) {
    if (!node) return false
    setChanged(false)
    return form.save(async () =>
      done(await saveNode(projectId, node.id, nodeSaveBody(node, fields))),
    )
  }

  return {
    node,
    setNode: (next: ProjectNodeDetail) => setLoad({ kind: 'ready', value: next }),
    draft,
    setDraft,
    isDirty,
    changed,
    message: form.message,
    setMessage,
    isSaving: form.isSaving,
    save,
    retry: () => {
      setMessage(null)
      retry()
    },
    reload: refresh,
  }
}
