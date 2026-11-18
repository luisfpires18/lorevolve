import type { Editor } from '@tiptap/react'
import { useId, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useLocalDraft } from '../lib/useLocalDraft'
import type { Scene, SceneManuscript } from './types'

export type LoadState =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error'; message: string }

/** The manuscript as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
export interface Stored {
  content: string
  updatedAt: string | null
  version: number
}

export function storedOf(manuscript: SceneManuscript): Stored {
  return {
    content: manuscript.content,
    updatedAt: manuscript.updatedAt,
    version: manuscript.version,
  }
}

/** The editor's ids, its recovery copy, every state and ref, and how to put the focus back in the prose. */
export function useManuscriptState({ universeId, scene }: { universeId: string; scene: Scene }) {
  const sceneId = scene.id
  const titleId = useId()
  const statusId = useId()
  const tooLongId = useId()
  const recoveryId = useId()
  const historyId = useId()
  const contextId = useId()

  const { user } = useAuth()
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user ? { accountId: user.id, universeId, kind: 'manuscript', contentId: sceneId } : null,
  )

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null, version: 0 })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  // On a phone the scene's planning folds behind Details, so the prose starts on the first screen. Wider, it is always shown.
  const [isContextOpen, setIsContextOpen] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  // Write is the editor, each mention a chip; Read shows the prose as a reader reads it, each mention a link.
  const [isReading, setIsReading] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const editor = useRef<Editor | null>(null)
  const shortcut = useRef<() => void>(() => {})
  const focusEditor = () => editor.current?.commands.focus(null, { scrollIntoView: false })
  return {
    sceneId,
    titleId,
    statusId,
    tooLongId,
    recoveryId,
    historyId,
    contextId,
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
    isSaving,
    setIsSaving,
    saves,
    setSaves,
    failure,
    setFailure,
    conflict,
    setConflict,
    isHistoryOpen,
    setIsHistoryOpen,
    isContextOpen,
    setIsContextOpen,
    historyKey,
    setHistoryKey,
    isReading,
    setIsReading,
    isLinking,
    setIsLinking,
    announcement,
    setAnnouncement,
    inFlight,
    editor,
    shortcut,
    focusEditor,
  }
}
