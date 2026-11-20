import { createIdeaBoard, saveIdeaBoard, type IdeaBoardDetail } from './boards'
import { fieldsOf, inputOf, sameFields, storedFrom, type Fields } from './boardDraft'
import type { useI18n } from '../i18n'
import type { useDraftedEditor } from '../lib/useDraftedEditor'
import type { useBoardState } from './useBoardState'
import { useSaveShortcut } from '../lib/useSaveShortcut'

/** A board editor's edits to its fields and its saves, Save and Ctrl+S / Cmd+S alike. */
export function useBoardSave({
  boardId,
  onCreated,
  t,
  setDraft,
  fieldErrors,
  setFieldErrors,
  isSaving,
  isDirty,
  isHeld,
  draft,
  titleInput,
  runSave,
  setConflict,
  stored,
  discard,
  setStored,
  setSaves,
}: ReturnType<typeof useBoardState> &
  ReturnType<typeof useDraftedEditor<Fields>> & {
    boardId: string | null
    onCreated: (board: IdeaBoardDetail) => void
    t: ReturnType<typeof useI18n>['t']
  }) {
  // Worked out from `boardId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = boardId === null
  function edit(change: Partial<Fields>) {
    setDraft((current) => ({ ...current, ...change }))
    if (change.title !== undefined && fieldErrors.title) setFieldErrors({})
  }

  async function save(expectedUpdatedAt: string | null) {
    if (isSaving || !isDirty || isHeld) return
    if (draft.title.trim() === '') {
      setFieldErrors({ title: t('ideas.board.titleRequired') })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    await runSave(async () => {
      setConflict(null)
      if (isNew) {
        const created = await createIdeaBoard(inputOf(sent, null))
        discard()
        onCreated(created)
        return
      }
      const saved = await saveIdeaBoard(boardId, inputOf(sent, expectedUpdatedAt))
      const next = storedFrom(saved)
      setStored(next)
      // Anything changed while the save was in flight is still unsaved, and stays.
      setDraft((current) => (sameFields(current, sent) ? fieldsOf(next) : current))
      setSaves((total) => total + 1)
    })
  }

  useSaveShortcut(() => void save(stored.updatedAt))

  return { edit, save }
}
