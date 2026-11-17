import { useEffect, useRef, useState } from 'react'
import { type PendingImage } from '../components/EntityImageField'
import type { PendingFieldImage } from '../components/FieldImageInput'
import type { CanonBlockingFinding } from '../canon/types'
import { type EntityDetail } from './types'
import { type CopySource, type Draft } from './entryDraft'

/** Every state and shared ref of the entry screen, as one object, with the focus a refused save asks for. */
export function useEntryState({ isNew }: { isNew: boolean }) {
  const [source, setSource] = useState<CopySource | null>(null)
  const [sourceStatus, setSourceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [copyArticle, setCopyArticle] = useState(false)
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [editedDraft, setDraft] = useState<Draft | null>(null)
  const [isFormOpen, setIsEditing] = useState(isNew)
  // The form is open to send a suggestion rather than to save (task 045): the entry itself is not changed.
  const [isSuggesting, setIsSuggesting] = useState(false)
  // A suggestion just sent from here, said where it can be seen.
  const [sent, setSent] = useState(false)
  const [reads, setReads] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    isNew ? 'ready' : 'loading',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  // Which field sections the reader has opened or folded here (Issue #26), by id; one not in it starts as its type says.
  // Transient on purpose: nothing is stored, so the next visit starts from the author's choice again.
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({})
  // The field a refused save sends the focus to, once the render that opens its section is on screen.
  const focusField = useRef<string | null>(null)
  useEffect(() => {
    if (!focusField.current) return
    document
      .querySelector(`[data-field-id="${focusField.current}"]`)
      ?.querySelector<HTMLElement>('input, select, textarea')
      ?.focus()
    focusField.current = null
  })
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // The form's save was refused because the entry was saved somewhere else while it was open (ADR 0043). The form keeps
  // every unsaved change until the author has reviewed the latest and chosen.
  const [conflict, setConflict] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const saveButton = useRef<HTMLButtonElement>(null)

  // While the article is being written it has its own save bar, and the entry's actions step aside for it: one
  // editor, and one bar at the foot of a phone's screen, at a time.
  const [isWritingArticle, setIsWritingArticle] = useState(false)
  // A new entry's picture, and the square its author framed, wait here until the entry exists.
  // Object keys are built from the entry's id, so there is nowhere to put it before the create
  // call comes back - and inventing a temporary path would mean writing objects nobody would ever
  // come back to clean up.
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  // The same wait for each Image field of a new entry, by field id.
  const [pendingFieldImages, setPendingFieldImages] = useState<Record<string, PendingFieldImage>>(
    {},
  )

  // Bumped after every accepted write, so the history reloads without either component
  // holding the other's state.
  const [historyKey, setHistoryKey] = useState(0)

  // The full picture is page state, not an address: opening it is never a step Back has to undo.
  const [isViewing, setIsViewing] = useState(false)
  const [chosenPicture, setChosenPicture] = useState<{ entityId?: string; id: string } | null>(null)
  return {
    source,
    setSource,
    sourceStatus,
    setSourceStatus,
    copyArticle,
    setCopyArticle,
    detail,
    setDetail,
    editedDraft,
    setDraft,
    isFormOpen,
    setIsEditing,
    isSuggesting,
    setIsSuggesting,
    sent,
    setSent,
    reads,
    setReads,
    status,
    setStatus,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    sectionOpen,
    setSectionOpen,
    focusField,
    blocked,
    setBlocked,
    isSaving,
    setIsSaving,
    conflict,
    setConflict,
    announcement,
    setAnnouncement,
    saveButton,
    isWritingArticle,
    setIsWritingArticle,
    pendingImage,
    setPendingImage,
    pendingFieldImages,
    setPendingFieldImages,
    historyKey,
    setHistoryKey,
    isViewing,
    setIsViewing,
    chosenPicture,
    setChosenPicture,
  }
}
