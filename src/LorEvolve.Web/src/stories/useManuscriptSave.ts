import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { MANUSCRIPT_CHANGED, saveSceneManuscript } from './api'
import { storedOf, type useManuscriptState } from './useManuscriptState'
import { useSaveShortcut } from '../lib/useSaveShortcut'

/** Saves the text, and wires Ctrl+S / Cmd+S to the latest save. */
export function useManuscriptSave({
  universeId,
  storyId,
  sceneId,
  stored,
  setStored,
  draft,
  setIsSaving,
  setSaves,
  setFailure,
  setConflict,
  setHistoryKey,
  inFlight,
  focusEditor,
  isDirty,
  isTooLong,
}: ReturnType<typeof useManuscriptState> & {
  universeId: string
  storyId: string
  isDirty: boolean
  isTooLong: boolean
}) {
  /** Saves the text as it stands, naming the stored manuscript's version it was written over. */
  async function save(expectedVersion: number) {
    if (inFlight.current || !isDirty || isTooLong) return

    const content = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await saveSceneManuscript(universeId, storyId, sceneId, {
        content,
        expectedVersion,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(storedOf(saved))
      setHistoryKey((key) => key + 1)
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, MANUSCRIPT_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('manuscript.editor.saveGone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.message)
      } else {
        setFailure(t('manuscript.editor.saveFailed'))
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
      // Save keeps the focus through a save (it is only aria-disabled). Should the focus have been let go anyway, rather
      // than leave it nowhere, it goes back to the prose.
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) focusEditor()
      })
    }
  }

  // Ctrl+S / Cmd+S saves from anywhere while a scene is open - the outline, the tools, or after Save has let go of the
  // focus - and never opens the browser's "Save page". The listener reads the latest save through a ref, so it is
  // added once rather than on every keystroke.
  useSaveShortcut(() => void save(stored.version))
  return { save }
}
