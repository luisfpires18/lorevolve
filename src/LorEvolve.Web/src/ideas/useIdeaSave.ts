import { useEffect } from 'react'
import { createIdea, IDEA_CHANGED, saveIdea } from './api'
import { fieldsOf, sameFields, storedFrom, storedMomentOf, type Fields } from './ideaDraft'
import type { IdeaDetail } from './types'
import { ApiError } from '../lib/api'
import type { useI18n } from '../i18n'
import type { useIdeaDraft } from './useIdeaDraft'
import type { useIdeaState } from './useIdeaState'

/** An idea editor's edits and saves, Save and Ctrl+S / Cmd+S alike. */
export function useIdeaSave({
  ideaId,
  onCreated,
  t,
  setDraft,
  fieldErrors,
  setFieldErrors,
  inFlight,
  isDirty,
  isTooLong,
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
}: ReturnType<typeof useIdeaState> &
  ReturnType<typeof useIdeaDraft> & {
    ideaId: string | null
    onCreated: (idea: IdeaDetail) => void
    t: ReturnType<typeof useI18n>['t']
  }) {
  // Worked out from `ideaId` here, so TypeScript still knows it is a string once `isNew` is false.
  const isNew = ideaId === null
  function edit(change: Partial<Fields>) {
    setDraft((current) => ({ ...current, ...change }))
    if (change.title !== undefined && fieldErrors.title) {
      setFieldErrors((current) => {
        const next = { ...current }
        delete next.title
        return next
      })
    }
  }

  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isTooLong || isHeld) return

    if (draft.title.trim() === '') {
      setFieldErrors({ title: t('ideas.editor.titleRequired') })
      titleInput.current?.focus()
      return
    }

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(null)

    const input = {
      title: sent.title.trim(),
      body: sent.body,
      universeId: sent.universeId,
      references: sent.references.map(({ kind, id }) => ({ kind, id })),
      expectedUpdatedAt,
      // A project belongs to one universe, so moving the idea to another takes it off the project.
      projectId: sent.universeId === stored.universeId ? stored.projectId : null,
    }

    try {
      if (isNew) {
        const created = await createIdea(input)
        discard()
        onCreated(created)
        return
      }

      const saved = await saveIdea(ideaId, input)
      const next = storedFrom(saved)
      setStored(next)
      // What was sent is now saved - trimmed, and with its references' names as they are. Anything typed while the save
      // was in flight is still unsaved, and stays.
      setDraft((current) => (sameFields(current, sent) ? fieldsOf(next) : current))
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === IDEA_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('ideas.editor.saveGone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('ideas.editor.saveNeedsChange'),
        )
      } else {
        setFailure(t('ideas.editor.saveFailed'))
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
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return { edit, save }
}
