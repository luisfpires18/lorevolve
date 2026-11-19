import { useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fieldsOf, type Fields, type LoadState, type Stored } from './ideaDraft'
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
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
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
    isSaving,
    setIsSaving,
    saves,
    setSaves,
    failure,
    setFailure,
    fieldErrors,
    setFieldErrors,
    conflict,
    setConflict,
    isPicking,
    setIsPicking,
    announcement,
    setAnnouncement,
    inFlight,
    titleInput,
    addButton,
    shortcut,
    contextUniverseId,
  }
}
