import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, List, Plus, Spline, StickyNote, Trash2, X } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EmptyState } from './EmptyState'
import { IdeaBoardCanvas, type BoardSelection } from './IdeaBoardCanvas'
import { IdeaBoardPicker, type PickedTarget } from './IdeaBoardPicker'
import { Quoted } from './NameList'
import { RecoveredDraft } from './RecoveredDraft'
import { SaveAction } from './SaveAction'
import { useAuth } from '../auth/useAuth'
import { listAllUniverses } from '../ideas/api'
import {
  BOARD_CARD_KIND_LABELS,
  BOARD_LABEL_MAX_LENGTH,
  BOARD_MAX_CARDS,
  BOARD_MAX_CONNECTIONS,
  BOARD_NOTE_MAX_LENGTH,
  BOARD_TITLE_MAX_LENGTH,
  BoardCardKind,
  cardName,
  createIdeaBoard,
  deleteIdeaBoard,
  getIdeaBoard,
  IDEA_BOARD_CHANGED,
  readingOrder,
  saveIdeaBoard,
  type BoardCard,
  type BoardConnection,
  type IdeaBoardDetail,
  type IdeaBoardInput,
} from '../ideas/boards'
import type { IdeaUniverse } from '../ideas/types'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { formatDateTime } from '../lib/dates'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useLocalDraft } from '../lib/useLocalDraft'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'elsewhere' }
  | { kind: 'error'; message: string }

/** What an author edits, and exactly what a recovery copy holds. */
interface Fields {
  title: string
  universeId: string | null
  cards: BoardCard[]
  connections: BoardConnection[]
}

/** The board as the API last confirmed it: what "unsaved" is measured against, and what the next save names. */
interface Stored extends Fields {
  universe: IdeaUniverse | null
  updatedAt: string | null
}

const NOTE_SIZE = { width: 220, height: 140 }
const LINKED_SIZE = { width: 240, height: 120 }

function inputOf(fields: Fields, expectedUpdatedAt: string | null): IdeaBoardInput {
  return {
    title: fields.title.trim(),
    universeId: fields.universeId,
    cards: fields.cards.map(({ id, kind, x, y, width, height, text, ideaId, entityId }) => ({
      id,
      kind,
      x,
      y,
      width,
      height,
      text: kind === BoardCardKind.Note ? (text ?? '') : null,
      ideaId: kind === BoardCardKind.Idea ? ideaId : null,
      entityId: kind === BoardCardKind.Entity ? entityId : null,
    })),
    connections: fields.connections.map(({ id, fromCardId, toCardId, label }) => ({
      id,
      fromCardId,
      toCardId,
      label: label?.trim() ? label.trim() : null,
    })),
    expectedUpdatedAt,
  }
}

function sameFields(a: Fields, b: Fields) {
  return JSON.stringify(inputOf(a, null)) === JSON.stringify(inputOf(b, null))
}

function storedFrom(board: IdeaBoardDetail): Stored {
  return {
    title: board.title,
    universeId: board.universe?.id ?? null,
    universe: board.universe,
    cards: board.cards,
    connections: board.connections,
    updatedAt: board.updatedAt,
  }
}

function fieldsOf({ title, universeId, cards, connections }: Fields): Fields {
  return { title, universeId, cards, connections }
}

function isBlank(fields: Fields) {
  return fields.title === '' && fields.cards.length === 0
}

/** A recovery copy read back, or null when it is not one this editor could have kept. */
function parseCopy(content: string): Fields | null {
  try {
    const value = JSON.parse(content) as Partial<Fields> | null
    if (
      !value ||
      typeof value.title !== 'string' ||
      !(value.universeId === null || typeof value.universeId === 'string') ||
      !Array.isArray(value.cards) ||
      !Array.isArray(value.connections)
    ) {
      return null
    }
    return {
      title: value.title,
      universeId: value.universeId,
      cards: value.cards,
      connections: value.connections,
    }
  } catch {
    return null
  }
}

const GAP = 24

/**
 * Where a new card goes: the centre of the view, or the nearest place beside or below it that no card covers yet, so a
 * card added is never hidden under another. A crowded board takes the centre anyway.
 */
function freeSpot(
  cards: BoardCard[],
  x: number,
  y: number,
  size: { width: number; height: number },
) {
  for (let step = 0; step < 12; step++) {
    const left = x + (step % 3) * (size.width + GAP)
    const top = y + Math.floor(step / 3) * (size.height + GAP)
    const covered = cards.some(
      (card) =>
        left < card.x + card.width &&
        left + size.width > card.x &&
        top < card.y + card.height &&
        top + size.height > card.y,
    )
    if (!covered) return { x: left, y: top }
  }
  return { x, y }
}

function storedMomentOf(problem: unknown) {
  const updatedAt = (problem as { updatedAt?: unknown } | null)?.updatedAt
  return typeof updatedAt === 'string' ? updatedAt : null
}

function plural(total: number, one: string, many: string) {
  return `${total} ${total === 1 ? one : many}`
}

interface IdeaBoardEditorProps {
  /** The board being edited, or null for a new one. */
  boardId: string | null
  /** The universe a new board starts in - the one it was started from - or null. */
  defaultUniverseId: string | null
  /** The universe this screen is inside, if any: only its boards open here. */
  contextUniverse: { id: string; name: string } | null
  listPath: string
  listLabel: ReactNode
  onCreated: (board: IdeaBoardDetail) => void
  onDeleted: (board: { id: string; title: string }) => void
}

/**
 * One idea board, new or saved (ADR 0066): a title, an optional universe, and cards - notes, ideas, lore entries - with
 * lines between them, on a canvas or as a plain list.
 *
 * A board is not lore. Placing an idea or an entry on it changes nothing about either, a line is never a relationship,
 * and nothing here offers to turn the board into anything else.
 *
 * Saving is explicit and whole, as an idea's is: Save, or Ctrl+S / Cmd+S. A save over a board saved elsewhere since it
 * opened is refused and the author chooses. Unsaved changes are kept on this device as a recovery copy (ADR 0029) and
 * leaving asks first. Every card is reachable without a pointer: Tab on the canvas, or the list view.
 */
export function IdeaBoardEditor({
  boardId,
  defaultUniverseId,
  contextUniverse,
  listPath,
  listLabel,
  onCreated,
  onDeleted,
}: IdeaBoardEditorProps) {
  const headingId = useId()
  const titleId = useId()
  const universeFieldId = useId()
  const statusId = useId()
  const recoveryId = useId()
  const inspectorId = useId()

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

  const [load, setLoad] = useState<LoadState>(isNew ? { kind: 'ready' } : { kind: 'loading' })
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

  useEffect(() => {
    if (isNew) return
    const controller = new AbortController()
    getIdeaBoard(boardId, controller.signal)
      .then((board) => {
        if (contextUniverseId !== null && board.universe?.id !== contextUniverseId) {
          setLoad({ kind: 'elsewhere' })
          return
        }
        const next = storedFrom(board)
        setStored(next)
        setDraft(fieldsOf(next))
        setLoad({ kind: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error', message: 'This board could not be opened.' },
        )
      })
    return () => controller.abort()
  }, [isNew, boardId, reads, contextUniverseId])

  useEffect(() => {
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => controller.abort()
  }, [])

  const isReady = load.kind === 'ready'
  const isDirty = isReady && (isNew ? !isBlank(draft) : !sameFields(draft, stored))

  const copy = found ? parseCopy(found.content) : null
  const isNothingToRecover = (fields: Fields) =>
    isNew ? isBlank(fields) : sameFields(fields, stored)
  const offer = isReady && found && copy && !isNothingToRecover(copy) ? found : null
  const isHeld = isReady && (offer !== null || found === undefined)

  const isUselessCopy =
    isReady && found !== undefined && found !== null && (copy === null || isNothingToRecover(copy))
  useEffect(() => {
    if (isUselessCopy) discard()
  }, [isUselessCopy, discard])

  useEffect(() => {
    if (!isReady || isHeld) return
    if (isDirty) keep(JSON.stringify(draft), stored.updatedAt)
    else forget()
  }, [isReady, isHeld, isDirty, draft, stored.updatedAt, keep, forget])

  const name = draft.title.trim() || stored.title || 'This board'
  useLeaveGuard(
    isDirty ? `“${name}” has unsaved changes. Leave without saving them?` : null,
    discard,
  )

  function edit(change: Partial<Fields>) {
    setDraft((current) => ({ ...current, ...change }))
    if (change.title !== undefined && fieldErrors.title) setFieldErrors({})
  }

  function editCard(id: string, change: Partial<BoardCard>) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.id === id ? { ...card, ...change } : card)),
    }))
  }

  async function save(expectedUpdatedAt: string | null) {
    if (inFlight.current || !isDirty || isHeld) return
    if (draft.title.trim() === '') {
      setFieldErrors({ title: 'Give the board a title, so you can find it again.' })
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
        setFailure(
          'This board is no longer here, so it could not be saved. It may have been deleted in another window.',
        )
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        const first = Object.values(error.fieldErrors)[0]
        setFailure(first ?? error.message)
      } else {
        setFailure('The board could not be saved. Your changes are still here. Try again.')
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

  function reread() {
    setConflict(null)
    setFailure(null)
    setFieldErrors({})
    setSelected(null)
    setConnecting(null)
    setLoad({ kind: 'loading' })
    setReads((total) => total + 1)
  }

  async function loadSavedVersion() {
    if (
      !(await confirmAction({
        title: 'Replace this board with the version saved elsewhere?',
        message: 'What you changed here since your last save will be lost.',
        confirmLabel: 'Use the saved version',
        cancelLabel: 'Keep my changes',
        variant: 'destructive',
      }))
    ) {
      return
    }
    discard()
    reread()
  }

  function recoverDraft() {
    if (!offer || !copy) return
    settle()
    const universeGone =
      copy.universeId !== null &&
      universes !== null &&
      !universes.some((universe) => universe.id === copy.universeId)
    setDraft(universeGone ? withoutEntries({ ...copy, universeId: null }) : copy)
    setAnnouncement(
      universeGone
        ? 'The recovered draft is on the board, unassigned: the universe it named no longer exists. It is not saved yet.'
        : 'The recovered draft is on the board. It is not saved yet.',
    )
  }

  function discardDraft() {
    discard()
    setAnnouncement('The recovered draft was discarded.')
  }

  /** The fields without their lore cards and the lines that touched them: lore cards need the board's universe. */
  function withoutEntries(fields: Fields): Fields {
    const gone = new Set(
      fields.cards.filter((card) => card.kind === BoardCardKind.Entity).map((card) => card.id),
    )
    return {
      ...fields,
      cards: fields.cards.filter((card) => !gone.has(card.id)),
      connections: fields.connections.filter(
        (line) => !gone.has(line.fromCardId) && !gone.has(line.toCardId),
      ),
    }
  }

  async function changeUniverse(next: string | null) {
    if (next === draft.universeId) return
    const entries = draft.cards.filter((card) => card.kind === BoardCardKind.Entity).length
    if (entries > 0) {
      const confirmed = await confirmAction({
        title: "Change this board's universe?",
        message: `Lore cards stay inside their universe. Changing it takes this board's ${plural(entries, 'lore card', 'lore cards')} off it, with their lines. Nothing is saved until you save.`,
        confirmLabel: 'Change universe',
        variant: 'warning',
      })
      if (!confirmed) return
      setDraft((current) => ({ ...withoutEntries(current), universeId: next }))
      setSelected(null)
      setConnecting(null)
      setAnnouncement('Universe changed. Its lore cards were taken off the unsaved board.')
      return
    }
    edit({ universeId: next })
  }

  function place(card: Omit<BoardCard, 'id' | 'x' | 'y'>) {
    const at = centre.current?.() ?? { x: 0, y: 0 }
    const spot = freeSpot(draft.cards, at.x - card.width / 2, at.y - card.height / 2, card)
    const id = crypto.randomUUID()
    const placed: BoardCard = { ...card, id, x: Math.round(spot.x), y: Math.round(spot.y) }
    setDraft((current) => ({ ...current, cards: [...current.cards, placed] }))
    setSelected({ kind: 'card', id })
    setAnnouncement(`Added “${cardName(placed)}” to the board. It is not saved yet.`)
  }

  function addNote() {
    place({
      kind: BoardCardKind.Note,
      ...NOTE_SIZE,
      text: '',
      ideaId: null,
      entityId: null,
      name: null,
      excerpt: null,
      entityTypeName: null,
      isGone: false,
    })
  }

  function addPicked(target: PickedTarget) {
    const kind = picking === 'entry' ? BoardCardKind.Entity : BoardCardKind.Idea
    setPicking(null)
    place({
      kind,
      ...LINKED_SIZE,
      text: null,
      ideaId: kind === BoardCardKind.Idea ? target.id : null,
      entityId: kind === BoardCardKind.Entity ? target.id : null,
      name: target.name,
      excerpt: target.excerpt,
      entityTypeName: target.entityTypeName,
      isGone: false,
    })
  }

  /** A card dropped somewhere new is drawn over the others: it moves to the end of the draw order. */
  function moveCard(id: string, x: number, y: number) {
    setDraft((current) => {
      const card = current.cards.find((each) => each.id === id)
      if (!card) return current
      return {
        ...current,
        cards: [
          ...current.cards.filter((each) => each.id !== id),
          { ...card, x: Math.round(x), y: Math.round(y) },
        ],
      }
    })
  }

  function removeCard(card: BoardCard) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.filter((each) => each.id !== card.id),
      connections: current.connections.filter(
        (line) => line.fromCardId !== card.id && line.toCardId !== card.id,
      ),
    }))
    setSelected(null)
    setConnecting(null)
    setAnnouncement(`Took “${cardName(card)}” off the board. It is not saved yet.`)
  }

  function connectTo(toCardId: string) {
    const from = connecting
    setConnecting(null)
    if (!from || from === toCardId) return
    const exists = draft.connections.find(
      (line) =>
        (line.fromCardId === from && line.toCardId === toCardId) ||
        (line.fromCardId === toCardId && line.toCardId === from),
    )
    if (exists) {
      setSelected({ kind: 'line', id: exists.id })
      setAnnouncement('Those two cards are already joined.')
      return
    }
    if (draft.connections.length >= BOARD_MAX_CONNECTIONS) {
      setAnnouncement(`A board holds up to ${BOARD_MAX_CONNECTIONS} lines.`)
      return
    }
    const id = crypto.randomUUID()
    setDraft((current) => ({
      ...current,
      connections: [...current.connections, { id, fromCardId: from, toCardId, label: null }],
    }))
    setSelected({ kind: 'line', id })
    const ends = [from, toCardId].map((cardId) =>
      cardName(draft.cards.find((card) => card.id === cardId)!),
    )
    setAnnouncement(`Joined “${ends[0]}” and “${ends[1]}”. It is not saved yet.`)
  }

  function editLine(id: string, label: string) {
    setDraft((current) => ({
      ...current,
      connections: current.connections.map((line) => (line.id === id ? { ...line, label } : line)),
    }))
  }

  function removeLine(id: string) {
    setDraft((current) => ({
      ...current,
      connections: current.connections.filter((line) => line.id !== id),
    }))
    setSelected(null)
    setAnnouncement('Removed the line. It is not saved yet.')
  }

  function select(selection: BoardSelection) {
    if (selection === null) setConnecting(null)
    setSelected(selection)
  }

  async function remove() {
    if (isNew) return
    const title = stored.title
    setFailure(null)
    const deleted = await confirmAction({
      title: (
        <>
          Delete “<bdi>{title}</bdi>”?
        </>
      ),
      message: isDirty
        ? 'Your unsaved changes will be lost. The board as last saved goes to Recently deleted, where you can restore it.'
        : 'It goes to Recently deleted, where you can restore it.',
      confirmLabel: 'Delete board',
      busyLabel: 'Deleting…',
      variant: isDirty ? 'destructive' : 'warning',
      failure: (error) =>
        error instanceof ApiError && error.status === 404
          ? 'This board is no longer here. It may already have been deleted in another window.'
          : 'The board could not be deleted. Try again.',
      action: () => deleteIdeaBoard(boardId),
    })
    if (!deleted) return
    discard()
    onDeleted({ id: boardId, title })
  }

  if (load.kind === 'loading') {
    return (
      <p className="notice" role="status" data-testid="board-loading">
        Opening the board…
      </p>
    )
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="board-missing"
        title="This board is not here."
        hint={
          <>
            It may have been deleted, or it belongs to someone else. Deleted boards wait in{' '}
            <Link to={`${listPath}?view=deleted`}>Recently deleted</Link>.
          </>
        }
      />
    )
  }

  if (load.kind === 'elsewhere') {
    return (
      <EmptyState
        testId="board-not-in-universe"
        title={
          <>
            This board is not in <Quoted text={contextUniverse?.name ?? ''} />.
          </>
        }
        hint={
          <>
            It belongs to another universe, or to none, so it does not open here.{' '}
            <Link to={`/app/ideas/boards/${boardId}`}>Open it in all boards</Link>.
          </>
        }
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="board-load-error">
        <p>{load.message}</p>
        <button className="button button--secondary" type="button" onClick={reread}>
          Try again
        </button>
      </div>
    )
  }

  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)
  const cardsById = new Map(draft.cards.map((card) => [card.id, card]))
  const selectedCard = selected?.kind === 'card' ? cardsById.get(selected.id) : undefined
  const selectedLine =
    selected?.kind === 'line'
      ? draft.connections.find((line) => line.id === selected.id)
      : undefined
  const isFull = draft.cards.length >= BOARD_MAX_CARDS
  const linesOf = (card: BoardCard) =>
    draft.connections.filter((line) => line.fromCardId === card.id || line.toCardId === card.id)
  const otherEnd = (line: BoardConnection, card: BoardCard) =>
    cardsById.get(line.fromCardId === card.id ? line.toCardId : line.fromCardId)

  return (
    <article className="board" aria-labelledby={headingId} data-testid="board-editor">
      <header className="idea__head">
        <Link className="idea__back" to={listPath} data-testid="board-back">
          {listLabel}
        </Link>
        <div className="doc__titlerow">
          <h1 className="idea__heading" id={headingId} data-testid="board-heading">
            {isNew ? 'New board' : <bdi>{stored.title}</bdi>}
          </h1>
          {!isNew ? (
            <ActionMenu label={`More actions for ${stored.title}`} triggerTestId="board-actions">
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={isSaving}
                onClick={() => void remove()}
                data-testid="board-delete"
              >
                <ActionIcon icon={Trash2} />
                Delete board
              </button>
            </ActionMenu>
          ) : null}
        </div>
        <p className="idea__lede">
          A place to lay possibilities out. Nothing on a board changes your world, and a line is not
          a relationship.
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              Last saved <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>
              .
            </>
          ) : null}
        </p>
      </header>

      {offer && copy ? (
        <div id={recoveryId}>
          <RecoveredDraft
            what={isNew ? 'a new board' : 'this board'}
            draft={offer}
            savedUpdatedAt={stored.updatedAt}
            preview={
              <div
                className="recovery__prose idea__preview prose"
                role="region"
                aria-label="The recovered draft"
                tabIndex={0}
              >
                <p className="idea__previewtitle">{copy.title || 'Untitled'}</p>
                <p>
                  {plural(copy.cards.length, 'card', 'cards')},{' '}
                  {plural(copy.connections.length, 'line', 'lines')}.
                </p>
              </div>
            }
            onRecover={recoverDraft}
            onDiscard={discardDraft}
            testId="board-recovery"
          />
        </div>
      ) : null}

      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="board-conflict">
          <p className="manuscript__conflicttext">
            This board was saved in another tab or on another device after you opened it here.
            Nothing was overwritten, and your version below is not saved.
          </p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={() => void save(conflict.updatedAt)}
              data-testid="board-keep-mine"
            >
              Save mine over it
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={isSaving}
              onClick={() => void loadSavedVersion()}
              data-testid="board-load-saved"
            >
              Load the saved version
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message idea__failure" role="alert" data-testid="board-error">
          {failure}
        </p>
      ) : null}

      <div className="board__fields">
        <div className="field">
          <label className="field__label" htmlFor={titleId}>
            Title
          </label>
          <input
            id={titleId}
            ref={titleInput}
            className="field__input"
            type="text"
            dir="auto"
            value={draft.title}
            maxLength={BOARD_TITLE_MAX_LENGTH}
            placeholder="Insert a title"
            readOnly={isHeld}
            onChange={(event) => edit({ title: event.target.value })}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? `${titleId}-error` : undefined}
            aria-required="true"
            data-testid="board-title"
          />
          {fieldErrors.title ? (
            <p className="field__error" id={`${titleId}-error`} data-testid="board-title-error">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={universeFieldId}>
            Universe
          </label>
          <select
            id={universeFieldId}
            className="field__input field__input--select"
            value={draft.universeId ?? ''}
            disabled={isHeld}
            onChange={(event) =>
              void changeUniverse(event.target.value === '' ? null : event.target.value)
            }
            data-testid="board-universe"
          >
            <option value="">No universe</option>
            {chosenUniverse && !universes?.some((universe) => universe.id === chosenUniverse.id) ? (
              <option value={chosenUniverse.id}>{chosenUniverse.name}</option>
            ) : null}
            {(universes ?? []).map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.isArchived ? `${universe.name} (archived)` : universe.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="board__toolbar" role="toolbar" aria-label="Board">
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull}
          onClick={addNote}
          data-testid="board-add-note"
        >
          <ActionIcon icon={StickyNote} />
          Add note
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull}
          onClick={() => setPicking('idea')}
          data-testid="board-add-idea"
        >
          <ActionIcon icon={Lightbulb} />
          Add idea
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isHeld || isFull || draft.universeId === null}
          title={draft.universeId === null ? 'Choose a universe to place its lore' : undefined}
          onClick={() => setPicking('entry')}
          data-testid="board-add-entry"
        >
          <ActionIcon icon={Plus} />
          Add lore
        </button>
        <button
          className="button button--secondary board__layout"
          type="button"
          aria-pressed={layout === 'list'}
          onClick={() => setLayout(layout === 'list' ? 'board' : 'list')}
          data-testid="board-list-toggle"
        >
          <ActionIcon icon={List} />
          List view
        </button>
      </div>
      {isFull ? (
        <p className="field__hint" data-testid="board-full">
          A board holds up to {BOARD_MAX_CARDS} cards.
        </p>
      ) : null}
      {connecting ? (
        <p className="notice board__connecting" role="status" data-testid="board-connecting">
          Drawing a line from “{cardName(cardsById.get(connecting)!)}”: choose the card it ends at.{' '}
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setConnecting(null)}
            data-testid="board-connect-cancel"
          >
            Cancel
          </button>
        </p>
      ) : null}

      <div className="board__work">
        {layout === 'board' ? (
          <IdeaBoardCanvas
            title={draft.title}
            cards={draft.cards}
            connections={draft.connections}
            selected={selected}
            connecting={connecting}
            readOnly={isHeld}
            onSelect={select}
            onConnectTo={connectTo}
            onMoveCard={moveCard}
            centreRef={centre}
          />
        ) : (
          <div className="boardlist" data-testid="board-list">
            {draft.cards.length === 0 ? (
              <p className="idea__noreferences">No cards yet.</p>
            ) : (
              <ol className="boardlist__cards">
                {readingOrder(draft.cards).map((card) => {
                  const lines = linesOf(card)
                  return (
                    <li className="boardlist__card" key={card.id}>
                      <button
                        className="boardlist__choose"
                        type="button"
                        aria-pressed={selectedCard?.id === card.id}
                        onClick={() =>
                          connecting && connecting !== card.id
                            ? connectTo(card.id)
                            : select({ kind: 'card', id: card.id })
                        }
                        data-testid="board-list-card"
                        data-name={cardName(card)}
                      >
                        <span className="idearef__kind">{BOARD_CARD_KIND_LABELS[card.kind]}</span>{' '}
                        <bdi>{cardName(card)}</bdi>
                        {card.isGone ? (
                          <span className="idearef__trashed">
                            {' '}
                            {card.kind === BoardCardKind.Idea ? 'Deleted idea' : 'In the Trash'}
                          </span>
                        ) : null}
                      </button>
                      {lines.length > 0 ? (
                        <ul className="boardlist__lines">
                          {lines.map((line) => (
                            <li key={line.id}>
                              Joined to <bdi>{cardName(otherEnd(line, card)!)}</bdi>
                              {line.label ? <> - {line.label}</> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        )}

        <aside
          className="board__inspector"
          aria-labelledby={inspectorId}
          data-testid="board-inspector"
        >
          {selectedCard ? (
            <>
              <h2 className="idea__subheading" id={inspectorId}>
                {BOARD_CARD_KIND_LABELS[selectedCard.kind]}
                {selectedCard.kind === BoardCardKind.Entity && selectedCard.entityTypeName
                  ? ` · ${selectedCard.entityTypeName}`
                  : ''}
              </h2>
              {selectedCard.kind === BoardCardKind.Note ? (
                <div className="field">
                  <label className="field__label" htmlFor={`${inspectorId}-text`}>
                    Note
                  </label>
                  <textarea
                    id={`${inspectorId}-text`}
                    className="field__input field__input--area"
                    rows={5}
                    value={selectedCard.text ?? ''}
                    maxLength={BOARD_NOTE_MAX_LENGTH}
                    readOnly={isHeld}
                    onChange={(event) => editCard(selectedCard.id, { text: event.target.value })}
                    data-testid="board-note-text"
                  />
                </div>
              ) : (
                <div className="board__target">
                  <p className="idearow__title">
                    <bdi>{cardName(selectedCard)}</bdi>
                  </p>
                  {selectedCard.excerpt ? (
                    <p className="idearow__excerpt prose">{selectedCard.excerpt}</p>
                  ) : null}
                  {selectedCard.isGone ? (
                    <p className="idearef__trashed" data-testid="board-card-gone">
                      {selectedCard.kind === BoardCardKind.Idea
                        ? 'This idea was deleted. Restore it from Recently deleted to open it.'
                        : 'This entry is in the Trash. Restore it to open it.'}
                    </p>
                  ) : selectedCard.kind === BoardCardKind.Idea ? (
                    <Link to={`/app/ideas/${selectedCard.ideaId}`} data-testid="board-card-open">
                      Open the idea
                    </Link>
                  ) : draft.universeId ? (
                    <Link
                      to={`/app/universes/${draft.universeId}/lore/${selectedCard.entityId}`}
                      data-testid="board-card-open"
                    >
                      Open the entry
                    </Link>
                  ) : null}
                </div>
              )}

              {linesOf(selectedCard).length > 0 ? (
                <ul className="board__lines" data-testid="board-card-lines">
                  {linesOf(selectedCard).map((line) => (
                    <li key={line.id}>
                      <button
                        className="boardlist__choose"
                        type="button"
                        onClick={() => select({ kind: 'line', id: line.id })}
                      >
                        Line to <bdi>{cardName(otherEnd(line, selectedCard)!)}</bdi>
                        {line.label ? <> - {line.label}</> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="board__inspectoractions">
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isHeld || draft.cards.length < 2}
                  aria-pressed={connecting === selectedCard.id}
                  onClick={() =>
                    setConnecting(connecting === selectedCard.id ? null : selectedCard.id)
                  }
                  data-testid="board-connect"
                >
                  <ActionIcon icon={Spline} />
                  Draw a line from here
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isHeld}
                  onClick={() => removeCard(selectedCard)}
                  data-testid="board-remove-card"
                >
                  <ActionIcon icon={X} />
                  Take off the board
                </button>
              </div>
            </>
          ) : selectedLine ? (
            <>
              <h2 className="idea__subheading" id={inspectorId}>
                Line
              </h2>
              <p>
                Between <bdi>{cardName(cardsById.get(selectedLine.fromCardId)!)}</bdi> and{' '}
                <bdi>{cardName(cardsById.get(selectedLine.toCardId)!)}</bdi>.
              </p>
              <div className="field">
                <label className="field__label" htmlFor={`${inspectorId}-label`}>
                  Label
                </label>
                <input
                  id={`${inspectorId}-label`}
                  className="field__input"
                  type="text"
                  value={selectedLine.label ?? ''}
                  maxLength={BOARD_LABEL_MAX_LENGTH}
                  placeholder="Optional: why?"
                  readOnly={isHeld}
                  onChange={(event) => editLine(selectedLine.id, event.target.value)}
                  data-testid="board-line-label"
                />
              </div>
              <button
                className="button button--secondary"
                type="button"
                disabled={isHeld}
                onClick={() => removeLine(selectedLine.id)}
                data-testid="board-remove-line"
              >
                <ActionIcon icon={X} />
                Remove line
              </button>
            </>
          ) : (
            <>
              <h2 className="idea__subheading" id={inspectorId}>
                {plural(draft.cards.length, 'card', 'cards')},{' '}
                {plural(draft.connections.length, 'line', 'lines')}
              </h2>
              <p className="field__hint">
                Choose a card to write on it, open what it points at, or draw a line from it.
              </p>
            </>
          )}
        </aside>
      </div>

      <div className="manuscript__bar idea__bar">
        {failed && isDirty ? (
          <p className="recovery__warning" role="status" data-testid="board-recovery-warning">
            This device could not keep a recovery copy of these changes. Save to keep them.
          </p>
        ) : null}
        <div className="idea__actions">
          <SaveAction
            label={isNew ? 'Create board' : 'Save changes'}
            isDirty={isDirty}
            isSaving={isSaving}
            isBlocked={isHeld}
            saves={saves}
            restingStatus={stored.updatedAt === null ? 'Not saved yet' : 'Saved'}
            statusId={statusId}
            statusTestId="board-status"
            testId="board-save"
            type="button"
            onSave={() => void save(stored.updatedAt)}
            keyShortcuts="Control+S Meta+S"
          />
        </div>
      </div>

      {picking ? (
        <IdeaBoardPicker
          what={picking}
          universe={
            draft.universeId
              ? { id: draft.universeId, name: chosenUniverse?.name ?? 'this universe' }
              : null
          }
          placed={
            new Set(draft.cards.map((card) => card.ideaId ?? card.entityId ?? '').filter(Boolean))
          }
          onChoose={addPicked}
          onClose={() => setPicking(null)}
        />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="board-announcer">
        {announcement}
      </p>
    </article>
  )
}
