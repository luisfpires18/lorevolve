import { useEffect } from 'react'
import { createIdeaBoard, IDEA_BOARD_CHANGED, saveIdeaBoard, type IdeaBoardDetail } from './boards'
import {
  fieldsOf,
  inputOf,
  sameFields,
  storedFrom,
  storedMomentOf,
  type Fields,
} from './boardDraft'
import { ApiError } from '../lib/api'
import type { useI18n } from '../i18n'
import type { useBoardDraft } from './useBoardDraft'
import type { useBoardState } from './useBoardState'

/** A board editor's edits to its fields and its saves, Save and Ctrl+S / Cmd+S alike. */
export function useBoardSave({
  boardId,
  onCreated,
  t,
  setDraft,
  fieldErrors,
  setFieldErrors,
  inFlight,
  isDirty,
  isHeld,
  draft,
  titleInput,
  setIsSaving,
  setFailure,
  setConflict,
  stored,
  discard,
  setStored,
  setSaves,
  shortcut,
}: ReturnType<typeof useBoardState> &
  ReturnType<typeof useBoardDraft> & {
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
    if (inFlight.current || !isDirty || isHeld) return
    if (draft.title.trim() === '') {
      setFieldErrors({ title: t('ideas.board.titleRequired') })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(null)

    try {
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
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === IDEA_BOARD_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('ideas.board.saveGone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        const first = Object.values(error.fieldErrors)[0]
        setFailure(first ?? error.message)
      } else {
        setFailure(t('ideas.board.saveFailed'))
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  useEffect(() => {
    shortcut.current = () => void save(stored.updatedAt)
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        shortcut.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return { edit, save }
}
