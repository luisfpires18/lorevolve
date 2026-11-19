import { useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fieldsOf, type Fields, type LoadState, type Stored } from './boardDraft'
import type { BoardSelection } from './boardSelection'
import { useLocalDraft } from '../lib/useLocalDraft'
import type { UniverseSummary } from '../universes/types'

/** Every state and ref of a board's editor, with the account and the board's recovery copy. */
export function useBoardState({
  boardId,
  defaultUniverseId,
  contextUniverse,
}: {
  boardId: string | null
  defaultUniverseId: string | null
  contextUniverse: { id: string; name: string } | null
}) {
  const isNew = boardId === null
  const { user } = useAuth()

  // As an idea's: an existing board's copy belongs to the account; a new one's to the place it was started.
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user
      ? {
          accountId: user.id,
          universeId: isNew ? defaultUniverseId : null,
          kind: 'idea-board',
          contentId: boardId ?? 'new',
        }
      : null,
  )

  const [load, setLoad] = useState<LoadState>(
    isNew ? { kind: 'ready', value: null } : { kind: 'loading' },
  )
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>(() => ({
    title: '',
    universeId: defaultUniverseId,
    universe: null,
    cards: [],
    connections: [],
    updatedAt: null,
  }))
  const [draft, setDraft] = useState<Fields>(() => fieldsOf(stored))
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ updatedAt: string | null } | null>(null)
  const [picking, setPicking] = useState<'idea' | 'entry' | null>(null)
  const [selected, setSelected] = useState<BoardSelection>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [layout, setLayout] = useState<'board' | 'list'>('board')
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const titleInput = useRef<HTMLInputElement>(null)
  const centre = useRef<(() => { x: number; y: number }) | null>(null)
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
    picking,
    setPicking,
    selected,
    setSelected,
    connecting,
    setConnecting,
    layout,
    setLayout,
    announcement,
    setAnnouncement,
    inFlight,
    titleInput,
    centre,
    shortcut,
    contextUniverseId,
  }
}
