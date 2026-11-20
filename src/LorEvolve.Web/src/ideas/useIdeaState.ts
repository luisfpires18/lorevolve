import { useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { IDEA_CHANGED } from './api'
import { fieldsOf, storedMomentOf, type Fields, type LoadState, type Stored } from './ideaDraft'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { useFormSave } from '../lib/useFormSave'
import { useLocalDraft } from '../lib/useLocalDraft'
import type { UniverseSummary } from '../universes/types'

/** Every state and ref of an idea's editor, with the account and the idea's recovery copy. */
export function useIdeaState({
  ideaId,
  defaultUniverseId,
  contextUniverse,
}: {
  ideaId: string | null
  defaultUniverseId: string | null
  contextUniverse: { id: string; name: string } | null
}) {
  const isNew = ideaId === null
  const { user } = useAuth()

  // An existing idea's copy belongs to the account, not to a universe: the idea outlives any universe it is in. A new
  // idea's copy is kept per place it was started, so one started in a universe is never offered in another.
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user
      ? {
          accountId: user.id,
          universeId: isNew ? defaultUniverseId : null,
          kind: 'idea',
          contentId: ideaId ?? 'new',
        }
      : null,
  )

  const [load, setLoad] = useState<LoadState>(
    isNew ? { kind: 'ready', value: null } : { kind: 'loading' },
  )
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>(() => ({
    title: '',
    body: '',
    universeId: defaultUniverseId,
    universe: null,
    references: [],
    updatedAt: null,
    projectId: null,
  }))
  const [draft, setDraft] = useState<Fields>(() => fieldsOf(stored))
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [saves, setSaves] = useState(0)
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  // An idea changed elsewhere opens the conflict; an idea gone says so; only a 400 names fields.
  const form = useFormSave({
    needChange: () => t('ideas.editor.saveNeedsChange'),
    failed: () => t('ideas.editor.saveFailed'),
    badRequestOnly: true,
    refusal: (error) => {
      if (!(error instanceof ApiError)) return false
      if (error.status === 409 && error.code === IDEA_CHANGED) {
        setConflict({ updatedAt: storedMomentOf(error.problem) })
        return true
      }
      return error.status === 404 ? t('ideas.editor.saveGone') : false
    },
  })
  const [isPicking, setIsPicking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const shortcut = useRef<() => void>(() => {})
  const contextUniverseId = contextUniverse?.id ?? null

  return {
    isNew,
    user,
    found,
    keep,
    forget,
    discard,
    settle,
    failed,
    load,
    setLoad,
    reads,
    setReads,
    stored,
    setStored,
    draft,
    setDraft,
    universes,
    setUniverses,
    isSaving: form.isSaving,
    runSave: form.save,
    saves,
    setSaves,
    failure: form.message,
    setFailure: form.setMessage,
    fieldErrors: form.fieldErrors,
    setFieldErrors: form.setFieldErrors,
    conflict,
    setConflict,
    isPicking,
    setIsPicking,
    announcement,
    setAnnouncement,
    titleInput,
    addButton,
    shortcut,
    contextUniverseId,
  }
}
