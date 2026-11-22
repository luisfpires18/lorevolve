import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useAuth } from '../auth/useAuth'
import { useUniverseAccess } from '../universes/access'
import { ApiError } from '../lib/api'
import { errorText } from '../lib/errorText'
import type { Load } from '../lib/useAsyncRead'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import {
  ARTICLE_CHANGED,
  ARTICLE_MAX_LENGTH,
  getEntityArticle,
  saveEntityArticle,
  type EntityArticle,
} from './article'
import { isEmptyDocument } from './document'
import { useI18n } from '../i18n'
import type { EntityArticleSectionProps } from '../components/EntityArticle'
import { useSaveShortcut } from '../lib/useSaveShortcut'

/** The article as the API last confirmed it: what the next save names, and what reading mode shows. */
export interface Stored {
  content: string
  updatedAt: string | null
  version: number
}

export function storedOf(article: EntityArticle): Stored {
  return { content: article.content, updatedAt: article.updatedAt, version: article.version }
}

/** A document with no text in it is no article, however the editor happens to serialise the emptiness. */
export function comparable(json: string | null) {
  return isEmptyDocument(json) ? '' : (json ?? '')
}

/** An entry's article read, written and saved: its recovery copy, its leave question and its Ctrl+S / Cmd+S. */
export function useEntityArticle({
  universeId,
  entityId,
  entityName,
  onEditingChange,
  onSaved,
}: Pick<
  EntityArticleSectionProps,
  'universeId' | 'entityId' | 'entityName' | 'onEditingChange' | 'onSaved'
>) {
  const { t } = useI18n()
  const { user } = useAuth()
  // A Viewer or Reviewer reads the article and nothing more: no Edit, no Write, no history (ADR 0041 amendment).
  const access = useUniverseAccess()
  const { found, keep, forget, discard, settle, failed } = useLocalDraft(
    user ? { accountId: user.id, universeId, kind: 'article', contentId: entityId } : null,
  )

  const [load, setLoad] = useState<Load<null>>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<Stored>({ content: '', updatedAt: null, version: 0 })
  const [isEditing, setIsEditing] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [openingWith, setOpeningWith] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const inFlight = useRef(false)
  const section = useRef<HTMLElement>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const editor = useRef<Editor | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    getEntityArticle(universeId, entityId, controller.signal)
      .then((article) => {
        setStored(storedOf(article))
        setLoad({ kind: 'ready', value: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: errorText(error, '') },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, entityId, reads])

  useEffect(() => {
    onEditingChange(isEditing)
  }, [isEditing, onEditingChange])

  useEffect(
    () => () => {
      onEditingChange(false)
    },
    [onEditingChange],
  )

  const isReady = load.kind === 'ready'
  // Parsing up to 200k characters is the cost here, so only the draft is read again on every keystroke.
  const hasArticle = useMemo(() => !isEmptyDocument(stored.content), [stored.content])
  const saved = useMemo(() => comparable(baseline ?? stored.content), [baseline, stored.content])
  const outgoing = comparable(draft)
  const isDirty = isReady && isEditing && draft !== null && outgoing !== saved
  const length = outgoing.length
  const isTooLong = length > ARTICLE_MAX_LENGTH

  // A recovery copy that differs from what is saved is offered. Writing waits for the author's choice - and, for the
  // moment it takes, for the copy to be looked for - so nothing typed can overwrite a copy nobody has seen yet.
  const offer =
    isReady && !isEditing && found && comparable(found.content) !== comparable(stored.content)
      ? found
      : null
  const isHeld = isReady && !isEditing && (offer !== null || found === undefined)

  // A copy identical to what is saved is nothing to recover: it goes without a word.
  useEffect(() => {
    if (isReady && found && comparable(found.content) === comparable(stored.content)) discard()
  }, [isReady, found, stored.content, discard])

  // The recovery copy follows the writing: kept while it differs from what is saved, let go once it does not.
  useEffect(() => {
    if (!isEditing || draft === null) return
    if (isDirty) {
      keep(outgoing, stored.updatedAt)
    } else {
      forget()
    }
  }, [isEditing, draft, isDirty, outgoing, stored.updatedAt, keep, forget])

  useLeaveGuard(isDirty ? t('entity.article.leaveGuard', { name: entityName }) : null, discard)

  /** Saves the document as it stands, naming the stored article's version it was written over. */
  async function save(expectedVersion: number) {
    if (inFlight.current || !isDirty || isTooLong || draft === null) return

    const sent = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await saveEntityArticle(universeId, entityId, {
        content: comparable(sent),
        expectedVersion,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(storedOf(saved))
      setBaseline(sent)
      setHistoryKey((key) => key + 1)
      if (saved.updatedAt) onSaved(saved.updatedAt)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, ARTICLE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('entity.article.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.fieldErrors.content ?? error.message)
      } else {
        setFailure(t('entity.article.saveFailed'))
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
      // Save disables itself while it works and once nothing is unsaved, and a disabled button lets go of the focus.
      // Rather than leave it nowhere, it goes back to the writing.
      requestAnimationFrame(() => {
        const active = document.activeElement
        const current = editor.current
        // The writing may have been closed, or reloaded into a new editor, while the save was in flight.
        if ((!active || active === document.body) && current && !current.isDestroyed) {
          current.commands.focus()
        }
      })
    }
  }

  // Ctrl+S / Cmd+S saves while the article is being written and the focus is in it - the text, its toolbar or its save
  // bar - or nowhere at all, and then never opens the browser's "Save page". Anywhere else on the page, and whenever the
  // article is only being read, the shortcut is the browser's. The listener reads the latest save through a ref, so it
  // is added once per editing session rather than on every keystroke.
  useSaveShortcut(() => void save(stored.version), { enabled: isEditing, scope: section })

  return {
    access,
    found,
    discard,
    settle,
    failed,
    load,
    setLoad,
    setReads,
    stored,
    setStored,
    isEditing,
    setIsEditing,
    editorKey,
    setEditorKey,
    openingWith,
    setOpeningWith,
    draft,
    setDraft,
    setBaseline,
    isSaving,
    failure,
    setFailure,
    conflict,
    setConflict,
    historyKey,
    setHistoryKey,
    announcement,
    setAnnouncement,
    section,
    startButton,
    editor,
    isReady,
    hasArticle,
    saved,
    isDirty,
    length,
    isTooLong,
    offer,
    isHeld,
    save,
  }
}
