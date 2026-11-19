import { t } from '../i18n'
import { isChangedElsewhere } from '../lib/editConflict'
import { NODE_CHANGED, saveNode, scriptOf } from './structure'
import type { useScriptPartState } from './useScriptPartState'
import { errorText } from '../lib/errorText'

export function scriptPartActions({
  projectId,
  onSaved,
  canEdit,
  isPanel,
  isDirty,
  isTooLong,
  node,
  draft,
  script,
  isSaving,
  setNode,
  setDraft,
  setScript,
  setSaves,
  setIsSaving,
  setFailure,
  setChanged,
}: ReturnType<typeof useScriptPartState> & {
  projectId: string
  onSaved: () => void
  canEdit: boolean
  isPanel: boolean
  isDirty: boolean
  isTooLong: boolean
}) {
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
      else setFailure(errorText(error, t('projects.structure.failed')))
    } finally {
      setIsSaving(false)
    }
  }

  return { save }
}
